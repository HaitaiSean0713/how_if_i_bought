import express from "express";
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
import { format, subDays } from 'date-fns';

const app = express();
app.use(express.json());

app.get("/api/stock/:symbol", async (req, res) => {
  try {
    let symbol = req.params.symbol.toUpperCase();
    let result;
    if (symbol.includes('.')) {
      result = await yahooFinance.quote(symbol);
    } else {
      try {
        result = await yahooFinance.quote(symbol + '.TW');
      } catch (err) {
        result = await yahooFinance.quote(symbol + '.TWO');
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
    let symbol = req.params.symbol.toUpperCase();
    const dateStr = req.params.date;
    
    const queryOptions = {
      period1: format(subDays(new Date(dateStr), 14), 'yyyy-MM-dd'),
      period2: format(new Date(new Date(dateStr).getTime() + 86400000), 'yyyy-MM-dd')
    };
    
    let result = [];
    let finalSymbol = symbol;
    
    if (symbol.includes('.')) {
      result = await yahooFinance.historical(symbol, queryOptions);
    } else {
      try {
        finalSymbol = symbol + '.TW';
        result = await yahooFinance.historical(finalSymbol, queryOptions);
      } catch (err: any) {
        try {
          finalSymbol = symbol + '.TWO';
          result = await yahooFinance.historical(finalSymbol, queryOptions);
        } catch (err2: any) {
          throw new Error('找不到這檔股票的資料，請確認代號是否正確。');
        }
      }
    }
    
    if (!result || result.length === 0) {
      return res.status(404).json({ error: "找不到該日期的歷史股價" });
    }
    
    const closest = result.reverse().find((d: any) => new Date(d.date).getTime() <= new Date(dateStr).getTime());
    res.json({ ...(closest || result[0]), actualSymbol: finalSymbol });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || '歷史資料查詢失敗' });
  }
});

app.post("/api/quotes", async (req, res) => {
  try {
    const { symbols } = req.body;
    if (!Array.isArray(symbols) || symbols.length === 0) {
       return res.json([]);
    }
    
    const results = await Promise.allSettled(
      symbols.map(async (s) => {
        let sym = s.toUpperCase();
        if (sym.includes('.')) return await yahooFinance.quote(sym);
        try {
          return await yahooFinance.quote(sym + '.TW');
        } catch (e) {
          return await yahooFinance.quote(sym + '.TWO');
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

export default app;
