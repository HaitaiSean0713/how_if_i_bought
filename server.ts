import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
import { format, subDays, isWeekend, isAfter } from 'date-fns';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API constraints
  // Format should be like 2330.TW for Taiwan stocks. We might want to append .TW if not present
  
  app.get("/api/stock/:symbol", async (req, res) => {
    try {
      let symbol = req.params.symbol.toUpperCase();
      let result;
      const queryOptions = { lang: 'zh-Hant', region: 'TW' };
      if (symbol.includes('.')) {
        result = await yahooFinance.quote(symbol, queryOptions);
      } else {
        try {
          result = await yahooFinance.quote(symbol + '.TW', queryOptions);
        } catch (err) {
          try {
            result = await yahooFinance.quote(symbol + '.TWO', queryOptions);
          } catch (err2) {
            result = await yahooFinance.quote(symbol, queryOptions);
          }
        }
      }
      
      if (result) {
        const chineseRegex = /[\u4e00-\u9fa5]/;
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

const withTimeout = <T>(prom: Promise<T>, time: number) => 
  Promise.race([prom, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), time))]);

  app.get("/api/historical/:symbol/:date", async (req, res) => {
    try {
      let symbol = req.params.symbol.toUpperCase();
      const dateStr = req.params.date;
      
      // Add a range to ensure we get data (e.g., if it's weekend or holiday)
      const queryOptions = {
        period1: format(subDays(new Date(dateStr), 14), 'yyyy-MM-dd'),
        period2: format(new Date(new Date(dateStr).getTime() + 86400000), 'yyyy-MM-dd')
      };
      
      let result = [];
      let finalSymbol = symbol;
      
      if (symbol.includes('.')) {
        result = await withTimeout(yahooFinance.historical(symbol, queryOptions), 8000);
      } else {
        try {
          finalSymbol = symbol + '.TW';
          result = await withTimeout(yahooFinance.historical(finalSymbol, queryOptions), 8000);
        } catch (err: any) {
          try {
            finalSymbol = symbol + '.TWO';
            result = await withTimeout(yahooFinance.historical(finalSymbol, queryOptions), 8000);
          } catch (err2: any) {
            try {
              finalSymbol = symbol;
              result = await withTimeout(yahooFinance.historical(finalSymbol, queryOptions), 8000);
            } catch (err3: any) {
              throw new Error('找不到這檔股票的資料，請確認代號是否正確。');
            }
          }
        }
      }
      
      if (!result || result.length === 0) {
        return res.status(404).json({ error: "找不到該日期的歷史股價" });
      }
      
      // Get the closest date <= requested date
      const closest = result.reverse().find((d: any) => new Date(d.date).getTime() <= new Date(dateStr).getTime());
      const finalData = { ...(closest || result[0]), actualSymbol: finalSymbol };
      
      try {
        const quoteRes = await withTimeout(yahooFinance.quote(finalSymbol, { lang: 'zh-Hant', region: 'TW' }), 5000);
        if (quoteRes) {
          const chineseRegex = /[\u4e00-\u9fa5]/;
          if (quoteRes.longName && chineseRegex.test(quoteRes.longName)) {
            finalData.shortName = quoteRes.longName;
          } else if (quoteRes.displayName && chineseRegex.test(quoteRes.displayName)) {
            finalData.shortName = quoteRes.displayName;
          } else if (quoteRes.shortName) {
            finalData.shortName = quoteRes.shortName;
          }
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
          let sym = s.toUpperCase();
          let res;
          if (sym.includes('.')) res = await yahooFinance.quote(sym, queryOptions);
          else {
            try {
              res = await yahooFinance.quote(sym + '.TW', queryOptions);
            } catch (e) {
              try {
                res = await yahooFinance.quote(sym + '.TWO', queryOptions);
              } catch (e2) {
                try {
                  res = await yahooFinance.quote(sym, queryOptions);
                } catch (e3) {
                  // Ignore
                }
              }
            }
          }
          if (res) {
            const chineseRegex = /[\u4e00-\u9fa5]/;
            if (res.longName && chineseRegex.test(res.longName)) {
              res.shortName = res.longName;
            } else if (res.displayName && chineseRegex.test(res.displayName)) {
              res.shortName = res.displayName;
            }
          }
          return res;
        })
      );
      
      const quotesArray = results
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<any>).value)
        .filter(Boolean); // some might be undefined if everything failed
        
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
