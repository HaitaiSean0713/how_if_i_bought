export interface Portfolio {
  id: string;
  name: string;
  groupName?: string;
  groupInitialCapital?: number;
  userId?: string;
  createdAt?: number;
  updatedAt?: number;
  positions: Position[];
  closedPositions: ClosedPosition[];
  sortOrder?: number;
}

export interface GroupMemberComparison {
  portfolio: Portfolio;
  rank: number;
  totalCost: number;
  totalValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  returnOnCapitalPercent: number;
  quota?: number;
  remainingQuota?: number;
  quotaUsagePercent: number;
  isQuotaDepleted: boolean;
  positionsCount: number;
}

export interface PortfolioGroupSummary {
  groupName: string;
  perPortfolioCapital?: number;
  initialCapital?: number;
  portfolios: Portfolio[];
  memberComparisons: GroupMemberComparison[];
  totalCost: number;
  totalValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  remainingCash?: number;
  totalNetWorth: number;
  returnOnCapital: number;
  returnOnCapitalPercent: number;
}

export interface Position {
  id: string;
  symbol: string;
  shortName?: string;
  shares: number;
  buyDate: string;
  buyPrice: number;
  totalCost: number;
}

export interface ClosedPosition extends Position {
  sellDate: string;
  sellPrice: number;
  realizedReturn: number;
  realizedReturnPercent: number;
}

export interface QuoteData {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  shortName?: string;
}

export interface PortfolioSummary {
  totalCost: number;
  totalValue: number;
  totalReturn: number;
  totalReturnPercent: number;
}
