import assert from 'node:assert/strict';
import test from 'node:test';
import { parseImportText, parseImportTable, parseDelimited, planHoldingImport, holdingsVersion } from '../src/lib/holdingImport.ts';

const now = new Date('2026-09-23T04:00:00Z');
const date = '2026-09-21';
const base = () => ({ id: 'p', name: 'Test', positions: [
  { id: 'a', symbol: '2330.TW', shares: 1000, buyDate: '2024-06-03', buyPrice: 600, totalCost: 600000 },
  { id: 'b', symbol: '2330.TW', shares: 500, buyDate: '2025-01-03', buyPrice: 1000, totalCost: 500000 },
  { id: 'c', symbol: '0050.TW', shares: 1000, buyDate: '2024-06-03', buyPrice: 150, totalCost: 150000 },
], closedPositions: [] });
const parse = (text, action = 'set') => parseImportText(text, action, date, base());

test('Chinese prose parses trades, lots, dates, and cost without guessing totals', () => {
  const rows = parse('2024/06/03 買進 台積電（2330）1.5 張，每股 600 元；把 0050 調整為 2000 股，均價 150 元');
  assert.deepEqual(rows.map(r => [r.action,r.symbol,r.shares,r.price,r.date]), [ ['buy','2330','1500','600','2024-06-03'],['set','0050','2000','150',date] ]);
  assert.equal(parse('2330 買進 1000 股，總成本 600000 元')[0].price, '');
  assert.throws(() => planHoldingImport(base(), parse('買進 2330 -1000 股，每股 600 元'), 'batch', now), /正整數/);
  assert.equal(parse('買進 2330 1000 股或 2000 股，每股 600 元')[0].shares, '');
  assert.throws(() => planHoldingImport(base(), parse('不要買進 2330 1000 股，每股 600 元'), 'batch', now), /選擇操作/);
});

test('CSV quoted commas, TSV, markdown and reordered workbook headers retain exact stock codes', () => {
  const csv = '操作,日期,股票代號,價格,股數\n買進,2024/6/3,0050,"1,500","2,000"';
  assert.deepEqual(parse(csv).map(r => [r.symbol,r.shares,r.price,r.date]), [['0050','2000','1500','2024-06-03']]);
  assert.equal(parse('股票代號\t張數\t價格\n2330\t1.5\t600')[0].shares, '1500');
  assert.equal(parse('| 股票代號 | 股數 | 價格 |\n|---|---|---|\n|0050|1000|150|').length, 1);
  const excel = parseImportTable([['價格','股票代號','日期','股數'],[600,'2330',new Date('2024-06-03T00:00:00Z'),1000]], 'set', date);
  assert.equal(excel[0].date,'2024-06-03');
  assert.equal(parseImportTable([['股票代號','股數','價格','日期'],['2330',1000,600,'113/6/3']], 'set', date)[0].date, '2024-06-03');
  assert.throws(() => parseDelimited('a,"unclosed', ','), /雙引號/);
});

test('Setting a stock replaces its lots while preserving other stocks and existing closed records', () => {
  const original = base(); original.closedPositions = [{ id: 'old-sale' }];
  const previous = holdingsVersion(original);
  const result = planHoldingImport(original, parse('設定 2330 2000 股，均價 700 元'), 'batch', now);
  assert.equal(result.portfolio.positions.filter(p => p.symbol === '2330.TW').length, 1);
  assert.equal(result.portfolio.positions.find(p => p.symbol === '2330.TW').totalCost, 1400000);
  assert.equal(result.portfolio.positions.find(p => p.symbol === '0050.TW').shares, 1000);
  assert.equal(result.portfolio.closedPositions[0].id, 'old-sale');
  assert.equal(holdingsVersion(original), previous);
  assert.equal(result.changes[0].before,1500);
  assert.equal(result.changes[0].after,2000);
});

test('Selling consumes oldest eligible lots and creates correct realised returns', () => {
  const result = planHoldingImport(base(), parse('賣出 2330 1200 股，每股 1500 元'), 'batch', now);
  assert.equal(result.portfolio.positions.find(p => p.symbol === '2330.TW').shares, 300);
  assert.equal(result.portfolio.closedPositions.reduce((sum,p) => sum+p.totalCost,0), 800000);
  assert.equal(result.portfolio.closedPositions.reduce((sum,p) => sum+p.realizedReturn,0), 1000000);
  assert.throws(() => planHoldingImport(base(), parse('2024/07/01 賣出 2330 1200 股，每股 1500 元'), 'batch', now), /超過/);
});

test('Invalid or oversold batches never change the input portfolio', () => {
  const original = base(); const version = holdingsVersion(original);
  const rows = parse('買進 0050 1000 股，每股 150 元\n賣出 2330 9999 股，每股 1500 元');
  assert.throws(() => planHoldingImport(original, rows, 'batch', now), /第 2 筆/);
  assert.equal(holdingsVersion(original),version);
  for (const value of ['2027/01/01 買進 2330 1000 股，每股 600 元','2330 1000 股','買進 2330 1000 股，每股 -600 元']) {
    assert.throws(() => planHoldingImport(base(), parse(value), 'batch', now));
  }
});

test('Delete and sequential buy/sell operations have explicit preview changes', () => {
  const result = planHoldingImport(base(),parse('刪除 0050\n買進 2330 100 股，每股 700 元\n賣出 2330 200 股，每股 800 元'),'batch',now);
  assert.deepEqual(result.changes.map(c=>[c.before,c.after]),[[1000,0],[1500,1600],[1600,1400]]);
  assert.equal(result.portfolio.closedPositions.length,1);
  assert.throws(()=>planHoldingImport(base(),parse('刪除 6488'),'batch',now),/沒有/);
  assert.equal(parse('刪除持股 0050')[0].action,'delete');
  assert.equal(parse('設定總持股 0050 1000 股，均價 150 元')[0].action,'set');
});

test('Taiwan stock names, concise space formats, and broker statement actions are parsed accurately', () => {
  // Chinese stock name resolution even when not in portfolio
  const tsmc = parse('2024-06-03 買進 台積電 1000 股 600元', 'buy')[0];
  assert.equal(tsmc.symbol, '2330');
  assert.equal(tsmc.shares, '1000');
  assert.equal(tsmc.price, '600');

  const etf = parse('買進 元大台灣50 2 張 150 元', 'buy')[0];
  assert.equal(etf.symbol, '0050');
  assert.equal(etf.shares, '2000');

  // Concise 3-token space separated line
  const concise = parse('2330 1000 600', 'buy')[0];
  assert.equal(concise.symbol, '2330');
  assert.equal(concise.shares, '1000');
  assert.equal(concise.price, '600');

  // Taiwanese broker actions and compact dates
  const broker = parse('1130603 現股買進 2330 1,000 600.00')[0];
  assert.equal(broker.symbol, '2330');
  assert.equal(broker.action, 'buy');
  assert.equal(broker.date, '2024-06-03');

  const period = parse('零股買進 6488 500 股 @950', 'buy')[0];
  assert.equal(period.symbol, '6488');
  assert.equal(period.action, 'buy');
  assert.equal(period.price, '950');

  // Semicolon delimited input
  const semi = parse('2382;買進;1000;341.5');
  assert.equal(semi.length, 1);
  assert.equal(semi[0].symbol, '2382');
  assert.equal(semi[0].action, 'buy');
  assert.equal(semi[0].shares, '1000');
  assert.equal(semi[0].price, '341.5');
});

