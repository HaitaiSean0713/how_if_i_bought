import test from 'node:test';
import assert from 'node:assert/strict';
import { readPortfolioDocument, calculateGroupSummary } from '../src/lib/portfolioOperations.ts';

test('readPortfolioDocument parses groupName and groupInitialCapital correctly', () => {
  const docData = {
    name: '台股核心',
    groupName: '  資產配置組  ',
    groupInitialCapital: 1000000,
    positions: [],
    closedPositions: [],
    userId: 'u123',
    createdAt: 1000,
    updatedAt: 2000,
    sortOrder: 1,
  };

  const parsed = readPortfolioDocument('p1', docData);
  assert.equal(parsed.id, 'p1');
  assert.equal(parsed.name, '台股核心');
  assert.equal(parsed.groupName, '資產配置組');
  assert.equal(parsed.groupInitialCapital, 1000000);
});

test('readPortfolioDocument sanitizes invalid groupName and groupInitialCapital', () => {
  const docData = {
    name: '台股成長',
    groupName: '   ',
    groupInitialCapital: 'not-a-number',
  };

  const parsed = readPortfolioDocument('p2', docData);
  assert.equal(parsed.groupName, undefined);
  assert.equal(parsed.groupInitialCapital, undefined);
});

test('calculateGroupSummary calculates cost, value, remaining cash and return on capital', () => {
  const portfolios = [
    {
      id: 'p1',
      name: '核心 ETF',
      groupName: '退休成長組合',
      groupInitialCapital: 1000000,
      positions: [
        {
          id: 'pos1',
          symbol: '0050',
          buyPrice: 150,
          shares: 2000,
          totalCost: 300000,
          buyDate: '2024-01-01',
        },
      ],
      closedPositions: [],
    },
    {
      id: 'p2',
      name: '高股息衛星',
      groupName: '退休成長組合',
      groupInitialCapital: 1000000,
      positions: [
        {
          id: 'pos2',
          symbol: '00878',
          buyPrice: 20,
          shares: 10000,
          totalCost: 200000,
          buyDate: '2024-01-01',
        },
      ],
      closedPositions: [],
    },
    {
      id: 'p3',
      name: '獨立組合 (非同群)',
      groupName: '其他專案',
      groupInitialCapital: 500000,
      positions: [
        {
          id: 'pos3',
          symbol: '2330',
          buyPrice: 800,
          shares: 1000,
          totalCost: 800000,
          buyDate: '2024-01-01',
        },
      ],
      closedPositions: [],
    },
  ];

  const quotes = {
    '0050.TW': { symbol: '0050.TW', regularMarketPrice: 180 },
    '00878.TW': { symbol: '00878.TW', regularMarketPrice: 22 },
  };

  const summary = calculateGroupSummary('退休成長組合', portfolios, quotes);

  assert.equal(summary.groupName, '退休成長組合');
  assert.equal(summary.portfolios.length, 2);
  assert.equal(summary.initialCapital, 1000000);
  
  // Total cost = 300,000 + 200,000 = 500,000
  assert.equal(summary.totalCost, 500000);
  
  // Total value = (2000 * 180) + (10000 * 22) = 360,000 + 220,000 = 580,000
  assert.equal(summary.totalValue, 580000);

  // Remaining cash = 1,000,000 - 500,000 = 500,000
  assert.equal(summary.remainingCash, 500000);

  // Total net worth = cash (500,000) + stock value (580,000) = 1,080,000
  assert.equal(summary.totalNetWorth, 1080000);

  // Total return = 580,000 - 500,000 = 80,000
  assert.equal(summary.totalReturn, 80000);

  // Return on initial capital = (80,000 / 1,000,000) * 100 = 8%
  assert.equal(summary.returnOnCapitalPercent, 8);

  // Return on invested cost = (80,000 / 500,000) * 100 = 16%
  assert.equal(summary.totalReturnPercent, 16);
});

test('calculateGroupSummary handles empty or non-existent group gracefully', () => {
  const summary = calculateGroupSummary('不存在群組', [], {});
  assert.equal(summary.groupName, '不存在群組');
  assert.equal(summary.portfolios.length, 0);
  assert.equal(summary.totalCost, 0);
  assert.equal(summary.totalValue, 0);
  assert.equal(summary.totalReturn, 0);
  assert.equal(summary.totalReturnPercent, 0);
  assert.equal(summary.initialCapital, undefined);
  assert.equal(summary.remainingCash, undefined);
  assert.equal(summary.totalNetWorth, 0);
});
