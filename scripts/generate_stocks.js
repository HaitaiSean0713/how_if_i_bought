import fs from 'fs';

async function generate() {
  const [twse, tpex] = await Promise.all([
    fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL').then(r => r.json()),
    fetch('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes').then(r => r.json())
  ]);

  const stocks = {};
  const aliases = {
    '台積電': '2330.TW', '鴻海': '2317.TW', '聯發科': '2454.TW', '台達電': '2308.TW',
    '廣達': '2382.TW', '緯創': '3231.TW', '技嘉': '2376.TW', '微星': '2377.TW', '華碩': '2357.TW',
    '長榮': '2603.TW', '陽明': '2609.TW', '萬海': '2615.TW', '長榮航': '2618.TW', '華航': '2610.TW', '星宇': '2646.TW', '星宇航空': '2646.TW',
    '元大台灣50': '0050.TW', '台灣50': '0050.TW', '元大高股息': '0056.TW', '高股息': '0056.TW',
    '富邦台50': '006208.TW', '國泰永續高股息': '00878.TW', '群益台灣精選高息': '00919.TW', '群益精選高息': '00919.TW',
    '復華台灣科技優息': '00929.TW', '元大台灣價值高息': '00940.TW', '統一台灣高息動能': '00939.TW',
    '富邦金': '2881.TW', '國泰金': '2882.TW', '中信金': '2891.TW', '玉山金': '2884.TW', '兆豐金': '2886.TW',
    '第一金': '2892.TW', '合庫金': '5880.TW', '華南金': '2880.TW', '台新金': '2887.TW', '永豐金': '2890.TW',
    '大立光': '3008.TW', '環球晶': '6488.TWO', '世芯': '3661.TW', '世芯-KY': '3661.TW', '創意': '3443.TW',
    '智原': '3035.TW', '信驊': '5274.TWO', '力旺': '3529.TWO', '祥碩': '5269.TW', '譜瑞': '4966.TWO', '譜瑞-KY': '4966.TWO',
    '台泥': '1101.TW', '亞泥': '1102.TW', '統一': '1216.TW', '台塑': '1301.TW', '南亞': '1303.TW', '中鋼': '2002.TW', '中華電': '2412.TW',
    'AAPL': 'AAPL', 'TSLA': 'TSLA', 'NVDA': 'NVDA', 'MSFT': 'MSFT', 'GOOGL': 'GOOGL', 'AMZN': 'AMZN', 'META': 'META', 'AMD': 'AMD', 'SPY': 'SPY', 'QQQ': 'QQQ', 'VOO': 'VOO'
  };

  for (const item of twse) {
    const code = (item.Code || '').trim();
    const name = (item.Name || '').trim();
    if (code && name && /^(?:\d{4,5}[A-Z]?|00\d{2,4}[A-Z]?)$/.test(code)) {
      stocks[code] = { name, symbol: code + '.TW' };
      if (!aliases[name]) aliases[name] = code + '.TW';
    }
  }

  for (const item of tpex) {
    const code = (item.SecuritiesCompanyCode || item.Code || '').trim();
    const name = (item.CompanyName || item.Name || '').trim();
    if (code && name && /^(?:\d{4,5}[A-Z]?|00\d{2,4}[A-Z]?)$/.test(code) && !stocks[code]) {
      stocks[code] = { name, symbol: code + '.TWO' };
      if (!aliases[name]) aliases[name] = code + '.TWO';
    }
  }

  const fileContent = `// Auto-generated Taiwan stock dictionary & resolver
export interface StockInfo { name: string; symbol: string; }

export const TAIWAN_STOCKS: Record<string, StockInfo> = ${JSON.stringify(stocks, null, 2)};

export const STOCK_ALIASES: Record<string, string> = ${JSON.stringify(aliases, null, 2)};

export function resolveStockSymbol(input: string): { symbol: string; shortName?: string } | null {
  const clean = input.trim().normalize('NFKC');
  if (!clean) return null;

  const upper = clean.toUpperCase();
  const rawCode = upper.replace(/\\.TW(O)?$/, '');

  if (TAIWAN_STOCKS[rawCode]) {
    return { symbol: TAIWAN_STOCKS[rawCode].symbol, shortName: TAIWAN_STOCKS[rawCode].name };
  }

  if (STOCK_ALIASES[clean]) {
    const sym = STOCK_ALIASES[clean];
    const code = sym.replace(/\\.TW(O)?$/, '');
    return { symbol: sym, shortName: TAIWAN_STOCKS[code]?.name || clean };
  }

  // Substring match for aliases in longer text (e.g. "買進台積電1000股" contains "台積電")
  for (const [alias, sym] of Object.entries(STOCK_ALIASES)) {
    if (alias.length >= 2 && clean.includes(alias)) {
      const code = sym.replace(/\\.TW(O)?$/, '');
      return { symbol: sym, shortName: TAIWAN_STOCKS[code]?.name || alias };
    }
  }

  for (const [code, info] of Object.entries(TAIWAN_STOCKS)) {
    if (info.name === clean || (info.name.length >= 2 && clean.includes(info.name))) {
      return { symbol: info.symbol, shortName: info.name };
    }
  }

  if (/^[A-Z][A-Z0-9.-]{0,11}$/.test(upper)) {
    return { symbol: upper };
  }

  if (/^\\d{4,6}[A-Z]?$/.test(rawCode)) {
    return { symbol: rawCode };
  }

  return null;
}
`;

  fs.writeFileSync('src/lib/taiwanStocks.ts', fileContent);
  console.log('Done updating src/lib/taiwanStocks.ts');
}

generate().catch(console.error);
