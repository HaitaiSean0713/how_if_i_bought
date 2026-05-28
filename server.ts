import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });
import { format, subDays, isWeekend, isAfter } from 'date-fns';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const withTimeout = <T>(prom: Promise<T>, time: number) => 
    Promise.race([prom, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), time))]);

  const chineseRegex = /[\u4e00-\u9fa5]/;

  // Helper: try multiple suffixes for a symbol
  async function resolveSymbol(symbol: string, queryFn: (sym: string) => Promise<any>): Promise<{ result: any; resolvedSymbol: string }> {
    if (symbol.includes('.')) {
      try {
        const result = await queryFn(symbol);
        return { result, resolvedSymbol: symbol };
      } catch (err: any) {
        console.log(`[API] ${symbol} failed: ${err.message}`);
        throw err;
      }
    }

    const suffixes = ['.TW', '.TWO', ''];
    let lastError = null;
    let hasEmptyArray = false;
    
    for (const suffix of suffixes) {
      const sym = symbol + suffix;
      try {
        const result = await queryFn(sym);
        // For chart/historical: check if result has data
        if (result !== null && result !== undefined) {
          if (Array.isArray(result)) {
            if (result.length > 0) return { result, resolvedSymbol: sym };
            // Empty array = no data, try next suffix
            hasEmptyArray = true;
            continue;
          }
          return { result, resolvedSymbol: sym };
        }
      } catch (err: any) {
        // Continue to next suffix
        console.log(`[API] ${sym} failed: ${err.message}`);
        lastError = err;
      }
    }
    
    if (lastError) {
      const msg = lastError.message.toLowerCase();
      if (msg.includes('timeout') || msg.includes('timed out')) {
        throw new Error(`查詢 ${symbol} 逾時，Yahoo Finance 回應過慢，請稍後再試。`);
      }
      if (msg.includes('rate limit') || msg.includes('429')) {
        throw new Error(`目前查詢人數過多，觸發 Yahoo API 限制，請稍後再試。`);
      }
    }
    
    if (hasEmptyArray) {
      throw new Error(`股票 ${symbol} 在該日期區間無交易資料，請確認是否已下市或尚未上市。`);
    }
    
    throw new Error('找不到這檔股票的資料，請確認代號是否正確。');
  }

  function enrichWithChineseName(result: any, quoteRes: any) {
    if (quoteRes) {
      if (quoteRes.longName && chineseRegex.test(quoteRes.longName)) {
        result.shortName = quoteRes.longName;
      } else if (quoteRes.displayName && chineseRegex.test(quoteRes.displayName)) {
        result.shortName = quoteRes.displayName;
      } else if (quoteRes.shortName) {
        result.shortName = quoteRes.shortName;
      }
    }
  }

  // API constraints
  // Format should be like 2330.TW for Taiwan stocks. We might want to append .TW if not present
  
  app.get("/api/stock/:symbol", async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const queryOptions = { lang: 'zh-Hant', region: 'TW' };
      
      const { result } = await resolveSymbol(symbol, (sym) => 
        withTimeout(yahooFinance.quote(sym, queryOptions), 5000)
      );
      
      if (result) {
        if (result.longName && chineseRegex.test(result.longName)) {
          result.shortName = result.longName;
        } else if (result.displayName && chineseRegex.test(result.displayName)) {
          result.shortName = result.displayName;
        }
      }
      
      res.json(result);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || '無法獲取股票資料' });
    }
  });

  app.get("/api/historical/:symbol/:date", async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const dateStr = req.params.date;
      
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.status(400).json({ error: '日期格式不正確，請使用 YYYY-MM-DD' });
      }
      
      const parts = dateStr.split('-');
      const localDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));

      const queryOptions = {
        period1: format(subDays(localDate, 14), 'yyyy-MM-dd'),
        period2: format(new Date(localDate.getTime() + 86400000), 'yyyy-MM-dd')
      };
      
      // Use chart() instead of deprecated historical()
      const { result, resolvedSymbol } = await resolveSymbol(symbol, async (sym) => {
        const chartResult = await withTimeout(
          yahooFinance.chart(sym, queryOptions),
          5000
        );
        const quotes = chartResult?.quotes;
        if (!quotes || quotes.length === 0) return [];
        return quotes;
      });
      
      if (!result || result.length === 0) {
        return res.status(404).json({ error: "找不到該日期的歷史股價" });
      }
      
      // Filter out quotes with null close unless it's our only choice
      const validQuotes = result.filter((q: any) => q.close != null);
      const dataToSearch = validQuotes.length > 0 ? validQuotes : result;
      
      // Get the closest date <= requested date
      const sorted = [...dataToSearch].sort((a: any, b: any) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const closest = sorted.find((d: any) => new Date(d.date).getTime() <= new Date(dateStr).getTime());
      const finalData = { ...(closest || dataToSearch[dataToSearch.length - 1]), actualSymbol: resolvedSymbol, shortName: symbol };
      
      try {
        const quoteRes = await withTimeout(yahooFinance.quote(resolvedSymbol, { lang: 'zh-Hant', region: 'TW' }), 4000);
        enrichWithChineseName(finalData, quoteRes);
        
        const now = new Date();
        const isToday = dateStr === format(now, 'yyyy-MM-dd');
        if (isToday) {
          const isBeforeOpen = now.getHours() < 9;
          if (isBeforeOpen) {
            finalData.close = quoteRes.regularMarketPreviousClose || finalData.close;
          } else {
            finalData.close = quoteRes.regularMarketPrice || finalData.close;
          }
        } else if (finalData.close == null && quoteRes.regularMarketPrice) {
          finalData.close = quoteRes.regularMarketPrice;
        }
      } catch (e) {
        // Ignored
      }
      
      res.json(finalData);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || '歷史資料查詢失敗' });
    }
  });

  // Multiquote API for updating portfolio
  app.post("/api/quotes", async (req, res) => {
    try {
      const { symbols } = req.body;
      if (!Array.isArray(symbols) || symbols.length === 0) {
         return res.json([]);
      }
      
      const queryOptions = { lang: 'zh-Hant', region: 'TW' };
      const results = await Promise.allSettled(
        symbols.map(async (s) => {
          try {
            const { result } = await resolveSymbol(s.toUpperCase(), (sym) => 
              withTimeout(yahooFinance.quote(sym, queryOptions), 5000)
            );
            if (result) {
              if (result.longName && chineseRegex.test(result.longName)) {
                result.shortName = result.longName;
              } else if (result.displayName && chineseRegex.test(result.displayName)) {
                result.shortName = result.displayName;
              }
            }
            return result;
          } catch (e) {
            return undefined;
          }
        })
      );
      
      const quotesArray = results
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<any>).value)
        .filter(Boolean);
        
      res.json(quotesArray);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
