import type { Portfolio, PortfolioGroupSummary } from '../types';

export function readPortfolioDocument(id: string, data: Partial<Portfolio>): Portfolio {
  const groupName = typeof data.groupName === 'string' && data.groupName.trim() ? data.groupName.trim() : undefined;
  const groupInitialCapital = typeof data.groupInitialCapital === 'number' && Number.isFinite(data.groupInitialCapital) && data.groupInitialCapital > 0 ? data.groupInitialCapital : undefined;
  return { 
    ...data, 
    id, 
    name: data.name || '未命名組合', 
    groupName,
    groupInitialCapital,
    positions: data.positions || [], 
    closedPositions: data.closedPositions || [] 
  };
}

export function calculateGroupSummary(
  groupName: string,
  portfolios: Portfolio[],
  quotes: Record<string, { regularMarketPrice?: number }> = {}
): PortfolioGroupSummary {
  const memberPortfolios = portfolios.filter(p => p.groupName === groupName);
  const foundCapital = memberPortfolios.find(p => typeof p.groupInitialCapital === 'number' && p.groupInitialCapital > 0)?.groupInitialCapital;

  let totalCost = 0;
  let totalValue = 0;
  let totalReturn = 0;

  for (const p of memberPortfolios) {
    for (const pos of p.positions) {
      const q = quotes[pos.symbol] || quotes[pos.symbol + '.TW'] || quotes[pos.symbol + '.TWO'];
      const price = q?.regularMarketPrice || pos.buyPrice;
      const val = price * pos.shares;
      totalCost += pos.totalCost;
      totalValue += val;
      totalReturn += (val - pos.totalCost);
    }
  }

  const totalReturnPercent = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;
  const perPortfolioCapital = foundCapital !== undefined ? foundCapital : undefined;
  // Group total capital is the sum of all member portfolios' individual quotas
  const initialCapital = perPortfolioCapital !== undefined ? perPortfolioCapital * memberPortfolios.length : undefined;
  const remainingCash = initialCapital !== undefined ? initialCapital - totalCost : undefined;
  const totalNetWorth = remainingCash !== undefined ? remainingCash + totalValue : totalValue;
  const returnOnCapital = totalReturn;
  const returnOnCapitalPercent = initialCapital !== undefined && initialCapital > 0
    ? (returnOnCapital / initialCapital) * 100
    : totalReturnPercent;

  return {
    groupName,
    perPortfolioCapital,
    initialCapital,
    portfolios: memberPortfolios,
    totalCost,
    totalValue,
    totalReturn,
    totalReturnPercent,
    remainingCash,
    totalNetWorth,
    returnOnCapital,
    returnOnCapitalPercent,
  };
}

export function checkPortfolioQuota(portfolio: Portfolio, addedCost: number) {
  if (typeof portfolio.groupInitialCapital !== 'number' || portfolio.groupInitialCapital <= 0) {
    return null;
  }
  const currentCost = portfolio.positions.reduce((sum, p) => sum + p.totalCost, 0);
  const projectedCost = currentCost + addedCost;
  const quota = portfolio.groupInitialCapital;
  const remaining = quota - currentCost;
  const allowed = projectedCost <= quota;
  const excess = allowed ? 0 : projectedCost - quota;
  return {
    allowed,
    quota,
    currentCost,
    projectedCost,
    remaining,
    excess,
  };
}

export function sortPortfolios(portfolios: Portfolio[]) {
  return [...portfolios].sort((a, b) => (a.sortOrder ?? a.createdAt ?? 0) - (b.sortOrder ?? b.createdAt ?? 0));
}

export function sellPosition(portfolio: Portfolio, positionId: string, saleId: string, sellDate: string, sellPrice: number, shares: number): Portfolio {
  const position = portfolio.positions.find(p => p.id === positionId);
  if (!position) throw new Error('此持倉已不存在，請重新整理。');
  if (!Number.isSafeInteger(shares) || shares <= 0 || shares > position.shares) throw new Error('持股數已變更或賣出股數無效，請重新確認。');
  if (!Number.isFinite(sellPrice) || sellPrice <= 0 || sellDate < position.buyDate) throw new Error('請確認賣出價格與日期。');
  const cost = position.totalCost * shares / position.shares;
  const realizedReturn = sellPrice * shares - cost;
  return {
    ...portfolio,
    positions: portfolio.positions.flatMap(p => p.id !== positionId ? [p] : shares === p.shares ? [] : [{ ...p, shares: p.shares - shares, totalCost: p.totalCost - cost }]),
    closedPositions: [{ ...position, id: saleId, shares, totalCost: cost, sellDate, sellPrice, realizedReturn, realizedReturnPercent: cost > 0 ? realizedReturn / cost * 100 : 0 }, ...portfolio.closedPositions],
  };
}

export function operationError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === 'permission-denied') return '帳號沒有操作此資料的權限，請確認登入帳號與雲端資料庫權限。';
  if (code === 'unavailable') return '目前無法連線至雲端，請確認網路後重試。';
  if (code === 'not-found') return '這個投資組合已不存在，請重新整理後再試。';
  if (code === 'unauthenticated') return '登入已失效，請重新登入。';
  if (error instanceof Error && error.name === 'QuotaExceededError') return '瀏覽器儲存空間不足，資料未儲存，請釋放空間後重試。';
  return error instanceof Error ? error.message : '操作失敗，請稍後重試。';
}
