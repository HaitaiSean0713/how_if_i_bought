import type { Portfolio, Position } from '../types';
import { validHistoricalDate, taiwanDate } from './historical';
import { sellPosition } from './portfolioOperations';

export type ImportAction = 'set' | 'buy' | 'sell' | 'delete';
export const actionLabels: Record<ImportAction, string> = { set: '設定總持股', buy: '買進', sell: '賣出', delete: '刪除持股' };
export interface ImportRow {
  id: string; action: string; symbol: string; shares: string; price: string; date: string; source: string;
}
export const MAX_IMPORT_ROWS = 300;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const symbolKey = (symbol: string) => symbol.trim().toUpperCase().replace(/\.TW(O)?$/, '');
export const holdingsVersion = (p: Portfolio) => JSON.stringify([p.id, p.positions, p.closedPositions]);

function clean(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim();
}
export function importDate(value: unknown, fallback: string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = clean(value);
  if (!raw) return fallback;
  const match = raw.match(/^(?:民國)?(\d{3,4})[年/.-](\d{1,2})[月/.-](\d{1,2})日?$/);
  if (!match) return raw;
  let year = Number(match[1]);
  if (match[1].length === 3) year += 1911;
  return `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}
export function importQuantity(value: unknown, lots = false): string {
  const raw = clean(value).replace(/,/g, '');
  const match = raw.match(/^([\d.]+)\s*(股|張)?$/);
  if (!match) return raw;
  return String(Number(match[1]) * (match[2] === '張' || (lots && !match[2]) ? 1000 : 1));
}
function importPrice(value: unknown) {
  return clean(value).replace(/^(?:NT\$|NTD|TWD|\$)\s*/i, '').replace(/元$/, '').replace(/,/g, '').trim();
}
function importAction(value: unknown, fallback: ImportAction): string {
  const action = clean(value).toLowerCase();
  if (!action) return fallback;
  if (/^(buy|買|買進|買入|新增|新增持倉|加碼|加買|增加|增持)$/.test(action)) return 'buy';
  if (/^(sell|賣|賣出|賣掉|減碼|減少|減持|平倉)$/.test(action)) return 'sell';
  if (/^(set|設定|設定總持股|調整|修改|更新|持有|持股|持倉|庫存|增加到|減少到|增加為|減少為|設為|改為|改成)$/.test(action)) return 'set';
  if (/^(delete|remove|刪除|刪除持股|移除)$/.test(action)) return 'delete';
  return action;
}
type Field = 'symbol' | 'shares' | 'price' | 'date' | 'action';
const aliases: Record<Field, string[]> = {
  symbol: ['股票代號', '股票代碼', '證券代號', '證券代碼', '代號', '代碼', '股票', 'symbol', 'ticker', 'stock'],
  shares: ['股數', '持有股數', '持股數', '持股數量', '庫存股數', '庫存數量', '交易股數', '成交股數', '數量', '張數', 'shares', 'quantity', 'qty'],
  price: ['價格', '買進價格', '買進均價', '買入價格', '成本均價', '平均成本', '成交價', '成交價格', '單價', '均價', '買價', '賣價', 'price', 'buyprice', 'costbasis'],
  date: ['日期', '買進日期', '買入日期', '交易日期', '成交日期', '賣出日期', 'date', 'buydate', 'tradedate'],
  action: ['操作', '動作', '買賣', '交易別', '交易類型', 'action', 'type', 'side'],
};
const headerField = (value: unknown) => (Object.keys(aliases) as Field[]).find(key => aliases[key].includes(clean(value).replace(/[\s_]/g, '').toLowerCase()));

export function parseImportTable(data: unknown[][], defaultAction: ImportAction, defaultDate: string): ImportRow[] {
  const rows = data.filter(row => row.some(cell => clean(cell)));
  if (!rows.length) throw new Error('檔案或工作表沒有內容。');
  const fields = rows[0].map(headerField);
  const hasHeader = fields.includes('symbol');
  if (hasHeader && fields.filter(Boolean).length !== new Set(fields.filter(Boolean)).size) throw new Error('欄位名稱重複，請每種欄位只保留一欄。');
  const body = hasHeader ? rows.slice(1) : rows;
  if (body.length > MAX_IMPORT_ROWS) throw new Error(`每次最多匯入 ${MAX_IMPORT_ROWS} 筆。`);
  return body.filter(row => !row.every(cell => /^:?-{3,}:?$/.test(clean(cell)))).map((row, index) => {
    const get = (field: Field, fallbackIndex: number) => row[hasHeader ? fields.indexOf(field) : fallbackIndex];
    return {
      id: `row-${index}`, source: row.map(clean).join(' / '),
      symbol: clean(get('symbol', 0)).toUpperCase(),
      shares: importQuantity(get('shares', 1), hasHeader && clean(rows[0][fields.indexOf('shares')]) === '張數'),
      price: importPrice(get('price', 2)), date: importDate(get('date', 3), defaultDate),
      action: importAction(get('action', 4), defaultAction),
    };
  });
}

// RFC-style quoted cells, including embedded newlines and doubled quotes.
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  const input = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || !cell.trim()) quoted = !quoted;
      else cell += char;
    } else if (!quoted && (char === delimiter || char === '\n')) {
      row.push(cell); cell = '';
      if (char === '\n') { rows.push(row); row = []; }
    } else cell += char;
  }
  if (quoted) throw new Error('表格的雙引號未成對，請修正後重新解析。');
  row.push(cell); rows.push(row);
  return rows;
}

export function parseImportText(text: string, defaultAction: ImportAction, defaultDate: string, portfolio: Portfolio): ImportRow[] {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error('文字太長，請拆成每次 2 MB 以內。');
  const input = text.normalize('NFKC').trim();
  if (!input) throw new Error('請先貼上文字或選取檔案。');
  const firstLine = input.split(/\r?\n/)[0];
  if (firstLine.includes('\t')) return parseImportTable(parseDelimited(input, '\t'), defaultAction, defaultDate);
  if (firstLine.includes('|')) return parseImportTable(input.split(/\r?\n/).filter(l => l.trim()).map(l => l.trim().replace(/^\||\|$/g, '').split('|')), defaultAction, defaultDate);
  if (firstLine.split(',').some(cell => headerField(cell)) || /^"?[A-Z0-9.^-]+"?,/i.test(firstLine)) return parseImportTable(parseDelimited(input, ','), defaultAction, defaultDate);
  const lines = input.split(/[\n;；。]+/).map(s => s.trim()).filter(Boolean);
  if (lines.length > MAX_IMPORT_ROWS) throw new Error(`每次最多匯入 ${MAX_IMPORT_ROWS} 筆。`);
  if (firstLine.split(/\s+/).some(cell => headerField(cell))) return parseImportTable(lines.map(l => l.split(/\s+/)), defaultAction, defaultDate);
  return lines.map((source, index) => {
    // Mask dates and monetary/quantity values before finding the stock code.
    const dateMatch = source.match(/(?:民國)?\d{3,4}[年/.-]\d{1,2}[月/.-]\d{1,2}日?/);
    const quantities = [...source.matchAll(/(-?[\d,]+(?:\.\d+)?)\s*(股|張)/g)];
    const quantity = quantities.length === 1 ? quantities[0] : quantities.length ? null : source.match(/(?:股數|數量)\s*[:：]?\s*(-?[\d,]+(?:\.\d+)?)/);
    const price = source.match(/(?:每股|成本均價|均價|買價|賣價|單價|價格|成交價)\s*[:：]?\s*\$?(-?[\d,]+(?:\.\d+)?)/) || (!/總成本|總價|總金額/.test(source) ? source.match(/(-?[\d,]+(?:\.\d+)?)\s*元/) : null);
    let masked = source;
    for (const match of [dateMatch, quantity, price]) if (match) masked = masked.replace(match[0], ' ');
    const codes = masked.match(/(?<![A-Za-z0-9])(?:\d{4,6}[A-Za-z]?(?:\.TW(?:O)?)?|[A-Za-z][A-Za-z0-9.-]{0,11})(?![A-Za-z0-9])/g)?.filter(s => !/^(buy|sell|set|delete|remove|NTD|TWD)$/i.test(s)) || [];
    const existing = portfolio.positions.filter(p => p.shortName && source.includes(p.shortName));
    const symbol = codes.length === 1 ? codes[0].toUpperCase() : !codes.length && new Set(existing.map(p => p.symbol)).size === 1 ? existing[0].symbol : '';
    const verbs = source.match(/刪除持股|設定總持股|新增持倉|增加到|減少到|增加為|減少為|刪除|移除|賣出|賣掉|減碼|減少|減持|平倉|買進|買入|新增|加碼|加買|增加|增持|設定|設為|改為|改成|調整|修改|更新|持有|\b(?:buy|sell|set|delete|remove)\b/gi) || [];
    const actions = [...new Set(verbs.map(v => importAction(v, defaultAction)))];
    const uncertain = /不要|不想|不買|不賣|取消|如果|假如|考慮|建議|預計|可能|或是|或者/.test(source);
    const action = actions.length > 1 || uncertain ? '請選擇操作' : actions[0] || defaultAction;
    return { id: `row-${index}`, source, action, symbol, shares: quantity ? importQuantity(quantity[1] + (quantity[2] || '')) : '', price: price ? importPrice(price[1]) : '', date: importDate(dateMatch?.[0], defaultDate) };
  });
}

export interface ImportChange { row: ImportRow; symbol: string; before: number; after: number; costBefore: number; costAfter: number; }
export function planHoldingImport(portfolio: Portfolio, rows: ImportRow[], batchId: string, now = new Date()) {
  if (!rows.length || rows.length > MAX_IMPORT_ROWS) throw new Error(`請提供 1 至 ${MAX_IMPORT_ROWS} 筆資料。`);
  let next: Portfolio = { ...portfolio, positions: portfolio.positions.map(p => ({ ...p })), closedPositions: [...portfolio.closedPositions] };
  const changes: ImportChange[] = [];
  rows.forEach((row, index) => {
    const fail = (message: string): never => { throw new Error(`第 ${index + 1} 筆：${message}`); };
    let symbol = row.symbol.trim().toUpperCase();
    if (!/^(?:\d{4,6}[A-Z]?(?:\.TWO?)?|[A-Z][A-Z0-9.-]{0,11})$/.test(symbol)) fail('請填入股票代號（例如 2330、0050、6488.TWO）。');
    const matches = next.positions.filter(p => symbolKey(p.symbol) === symbolKey(symbol));
    const markets = new Set(matches.map(p => p.symbol).filter(s => /\.TW(O)?$/.test(s)));
    if (markets.size > 1 || (markets.size === 1 && /\.TW(O)?$/.test(symbol) && !markets.has(symbol))) fail('股票市場與現有持股不一致，請確認代號。');
    symbol = [...markets][0] || symbol;
    const before = matches.reduce((sum, p) => sum + p.shares, 0);
    const costBefore = matches.reduce((sum, p) => sum + p.totalCost, 0);
    const shares = Number(importQuantity(row.shares)); const price = Number(importPrice(row.price));
    const date = importDate(row.date, ''); const action = row.action as ImportAction;
    if (!Object.hasOwn(actionLabels, action)) fail('請選擇操作。');
    if (action !== 'delete') {
      if (!row.shares.trim() || !Number.isSafeInteger(shares) || shares <= 0) fail('股數必須是正整數；清除持股請選「刪除持股」。');
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(price * shares)) fail('請填入大於零的每股價格，或使用「補齊缺少價格」。');
      if (!validHistoricalDate(date, now)) fail(`日期無效或晚於今天（${taiwanDate(now)}）。`);
    }
    if (action === 'set' || action === 'delete') next.positions = next.positions.filter(p => symbolKey(p.symbol) !== symbolKey(symbol));
    if (action === 'buy' || action === 'set') {
      if (action === 'buy' && !Number.isSafeInteger(before + shares)) fail('總股數超出可處理範圍。');
      const position: Position = { id: `${batchId}-${index}`, symbol, shares, buyPrice: price, buyDate: date, totalCost: shares * price };
      if (matches[0]?.shortName) position.shortName = matches[0].shortName;
      next.positions.push(position);
    } else if (action === 'sell') {
      const eligible = matches.filter(p => p.buyDate <= date).sort((a, b) => a.buyDate.localeCompare(b.buyDate));
      if (eligible.reduce((sum, p) => sum + p.shares, 0) < shares) fail('賣出股數超過該日期已買進的持股數。');
      let remaining = shares;
      for (const lot of eligible) {
        if (!remaining) break;
        const count = Math.min(remaining, lot.shares);
        next = sellPosition(next, lot.id, `${batchId}-${index}-${lot.id}`, date, price, count);
        remaining -= count;
      }
    } else if (action === 'delete' && !matches.length) fail('目前沒有這檔股票可刪除。');
    const afterLots = next.positions.filter(p => symbolKey(p.symbol) === symbolKey(symbol));
    changes.push({ row, symbol, before, after: afterLots.reduce((sum, p) => sum + p.shares, 0), costBefore, costAfter: afterLots.reduce((sum, p) => sum + p.totalCost, 0) });
  });
  return { portfolio: next, changes };
}
