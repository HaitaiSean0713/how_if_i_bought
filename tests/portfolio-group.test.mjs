import test from 'node:test';
import assert from 'node:assert/strict';
import { readPortfolioDocument, calculateGroupSummary, checkPortfolioQuota } from '../src/lib/portfolioOperations.ts';

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

test('calculateGroupSummary calculates cost, value, remaining cash and return on capital with independent quotas', () => {
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
  // Each portfolio has its own 1,000,000 quota, so perPortfolioCapital = 1,000,000 and total initialCapital = 2,000,000
  assert.equal(summary.perPortfolioCapital, 1000000);
  assert.equal(summary.initialCapital, 2000000);
  
  // Total cost = 300,000 + 200,000 = 500,000
  assert.equal(summary.totalCost, 500000);
  
  // Total value = (2000 * 180) + (10000 * 22) = 360,000 + 220,000 = 580,000
  assert.equal(summary.totalValue, 580000);

  // Remaining cash = 2,000,000 - 500,000 = 1,500,000
  assert.equal(summary.remainingCash, 1500000);

  // Total net worth = cash (1,500,000) + stock value (580,000) = 2,080,000
  assert.equal(summary.totalNetWorth, 2080000);

  // Total return = 580,000 - 500,000 = 80,000
  assert.equal(summary.totalReturn, 80000);

  // Return on initial capital = (80,000 / 2,000,000) * 100 = 4%
  assert.equal(summary.returnOnCapitalPercent, 4);

  // Return on invested cost = (80,000 / 500,000) * 100 = 16%
  assert.equal(summary.totalReturnPercent, 16);
});

test('checkPortfolioQuota allows purchases within quota and rejects when exceeding', () => {
  const portfolioWithQuota = {
    id: 'p1',
    name: '組合 A',
    groupName: '投資群組',
    groupInitialCapital: 5000000, // 500萬
    positions: [
      {
        id: 'pos1',
        symbol: '2330',
        buyPrice: 1000,
        shares: 3000,
        totalCost: 3000000, // 已用 300萬
        buyDate: '2024-01-01',
      },
    ],
    closedPositions: [],
  };

  // 1. Buying 1.5M -> total 4.5M <= 5M -> Allowed
  const check1 = checkPortfolioQuota(portfolioWithQuota, 1500000);
  assert.notEqual(check1, null);
  assert.equal(check1.allowed, true);
  assert.equal(check1.quota, 5000000);
  assert.equal(check1.currentCost, 3000000);
  assert.equal(check1.projectedCost, 4500000);
  assert.equal(check1.remaining, 2000000);
  assert.equal(check1.excess, 0);

  // 2. Buying 2.5M -> total 5.5M > 5M -> Rejected!
  const check2 = checkPortfolioQuota(portfolioWithQuota, 2500000);
  assert.notEqual(check2, null);
  assert.equal(check2.allowed, false);
  assert.equal(check2.projectedCost, 5500000);
  assert.equal(check2.excess, 500000);

  // 3. Exactly at quota (2M) -> total 5.0M <= 5M -> Allowed
  const check3 = checkPortfolioQuota(portfolioWithQuota, 2000000);
  assert.notEqual(check3, null);
  assert.equal(check3.allowed, true);
  assert.equal(check3.projectedCost, 5000000);
  assert.equal(check3.excess, 0);

  // 4. Portfolio without quota -> returns null (unrestricted)
  const portfolioWithoutQuota = {
    id: 'p2',
    name: '獨立組合',
    positions: [],
    closedPositions: [],
  };
  const check4 = checkPortfolioQuota(portfolioWithoutQuota, 10000000);
  assert.equal(check4, null);
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

