import { selectHistoricalQuote, validHistoricalDate, historicalRange } from './src/lib/historical';
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

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

  // Convert any date to Taiwan timezone date string (YYYY-MM-DD)
  function toTWDateStr(d: any): string {
    const dt = new Date(d);
    const twMs = dt.getTime() + 8 * 60 * 60 * 1000;
    return new Date(twMs).toISOString().split('T')[0];
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
      
      if (!validHistoricalDate(dateStr)) {
        return res.status(400).json({ error: '請使用有效且不晚於今天的日期 (YYYY-MM-DD)' });
      }
      
      const queryOptions = historicalRange(dateStr);
      
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
      
      const closest = selectHistoricalQuote(result, dateStr);
      if (!closest) return res.status(404).json({ error: '找不到該日期或之前的有效歷史股價' });
      const finalData = { ...closest, actualSymbol: resolvedSymbol, shortName: symbol };
      
      try {
        const quoteRes = await withTimeout(yahooFinance.quote(resolvedSymbol, { lang: 'zh-Hant', region: 'TW' }), 4000);
        enrichWithChineseName(finalData, quoteRes);
      } catch (e: any) {
        console.log(`[API Debug] Quote fetch error: ${e.message}`);
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

  app.post("/api/ai/parse-holdings", async (req, res) => {
    try {
      const { text, imageBase64, mimeType, defaultDate, defaultAction } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(400).json({ error: 'GEMINI_API_KEY 未設定，無法使用 AI 深度辨識。' });
      }

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const contents: any[] = [];

      const prompt = `你是專業的台股與美股投資持倉交易解析助手。請分析使用者輸入的交易文字或對帳單圖片/截圖，並精確提取出每筆持倉變更或交易紀錄。

規則：
1. 每筆紀錄包含：
   - symbol: 股票代號或名稱，儘量輸出標準代號（例如 2330、0050、6488.TWO、AAPL）。如果是中文名稱請盡可能轉換為台股代號（例如 台積電 -> 2330）。
   - shares: 成交或持有的總股數（例如 1張 -> 1000，1000股 -> 1000）。純數字字串。
   - price: 每股價格或平均成本（純數字字串，不要包含元或$）。若無法得知請留空字串。
   - date: 交易日期 (格式 YYYY-MM-DD)，若未標示請預設填入 "${defaultDate || ''}"。西元與民國日期皆請轉換為西元 YYYY-MM-DD。
   - action: 操作類型，必須為 "buy" (買進/新增), "sell" (賣出/平倉), "set" (設定總持股/庫存調整), 或 "delete" (刪除/清空)。預設操作為 "${defaultAction || 'set'}"。
   - source: 該筆資料的原始摘要文字。
2. 若使用者上傳的是手機券商 App 持倉或對帳單截圖，請仔細辨識圖片中每檔股票的名稱/代號、股數、成本均價或成交價、交易日期與買賣別。
3. 請輸出 JSON 陣列格式。`;

      contents.push(prompt);

      if (imageBase64) {
        const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
        contents.push({
          inlineData: {
            mimeType: mimeType || 'image/png',
            data: cleanBase64
          }
        });
      }

      if (text) {
        contents.push(`使用者輸入內容：\n${text}`);
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          responseMimeType: 'application/json',
        }
      });

      const jsonText = response.text || '[]';
      const parsed = JSON.parse(jsonText);
      res.json({ rows: parsed });
    } catch (error: any) {
      console.error('[API] AI parse holdings error:', error.message);
      res.status(500).json({ error: error.message || 'AI 解析失敗' });
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
