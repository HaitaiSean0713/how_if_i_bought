import type { Portfolio } from '../types';

export function readPortfolioDocument(id: string, data: Partial<Portfolio>): Portfolio {
  return { ...data, id, name: data.name || '未命名組合', positions: data.positions || [], closedPositions: data.closedPositions || [] };
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
