import express from "express";
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });
import { format, subDays } from 'date-fns';

const app = express();
app.use(express.json());

// Debug middleware for Vercel routing issues
app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.url} (originalUrl: ${req.originalUrl})`);
  next();
});

const withTimeout = <T>(prom: Promise<T>, time: number) => 
  Promise.race([prom, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), time))]);

const chineseRegex = /[\u4e00-\u9fa5]/;

// Helper: try multiple suffixes for a symbol
async function resolveSymbol(symbol: string, queryFn: (sym: string) => Promise<any>): Promise<{ result: any; resolvedSymbol: string }> {
  if (symbol.includes('.')) {
    const result = await queryFn(symbol);
    return { result, resolvedSymbol: symbol };
  }

  // Try .TW first, then .TWO, then raw
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

// Enrich result with Chinese name
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

// Convert any date to Taiwan timezone date string (YYYY-MM-DD)
function toTWDateStr(d: any): string {
  const dt = new Date(d);
  const twMs = dt.getTime() + 8 * 60 * 60 * 1000;
  return new Date(twMs).toISOString().split('T')[0];
}

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
    console.error('[API] stock error:', error.message);
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
    
    const queryOptions = {
      period1: format(subDays(new Date(dateStr), 14), 'yyyy-MM-dd'),
      period2: format(new Date(new Date(dateStr).getTime() + 86400000), 'yyyy-MM-dd')
    };
    
    // Use chart() instead of deprecated historical()
    // Each attempt gets 3s timeout to stay within Vercel's 10s limit
    const { result, resolvedSymbol } = await resolveSymbol(symbol, async (sym) => {
      const chartResult = await withTimeout(
        yahooFinance.chart(sym, queryOptions),
        3000
      );
      // chart() returns { quotes: [...], ... } structure
      const quotes = chartResult?.quotes;
      if (!quotes || quotes.length === 0) return [];
      return quotes;
    });
    
    if (!result || result.length === 0) {
      return res.status(404).json({ error: "找不到該日期的歷史股價" });
    }
    
    // Get the closest date <= requested date (compare Taiwan date strings to avoid timezone mismatch)
    const sorted = [...result].sort((a: any, b: any) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const closest = sorted.find((d: any) => toTWDateStr(d.date) <= dateStr);
    const finalData = { ...(closest || result[result.length - 1]), actualSymbol: resolvedSymbol, shortName: symbol };
    
    // Try to get Chinese name and today's dynamic price
    try {
      const quoteRes = await withTimeout(yahooFinance.quote(resolvedSymbol, { lang: 'zh-Hant', region: 'TW' }), 3000);
      enrichWithChineseName(finalData, quoteRes);
      
      const now = new Date();
      const taiwanTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      const taiwanDateStr = taiwanTime.toISOString().split('T')[0];
      const isToday = dateStr === taiwanDateStr;
      
      if (isToday) {
        const taiwanHour = taiwanTime.getUTCHours();
        const isBeforeOpen = taiwanHour < 9;
        if (isBeforeOpen) {
          finalData.close = quoteRes.regularMarketPreviousClose || finalData.close;
        } else {
          finalData.close = quoteRes.regularMarketPrice || finalData.close;
        }
      } else if (finalData.close == null && quoteRes.regularMarketPrice) {
        finalData.close = quoteRes.regularMarketPrice;
      }
    } catch (e) {
      // Name lookup failed, use symbol as fallback
    }
    
    res.json(finalData);
  } catch (error: any) {
    console.error('[API] historical error:', error.message);
    res.status(500).json({ error: error.message || '歷史資料查詢失敗' });
  }
});

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
            withTimeout(yahooFinance.quote(sym, queryOptions), 4000)
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
    console.error('[API] quotes error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default app;
