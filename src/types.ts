export interface Portfolio {
  id: string;
  name: string;
  userId?: string;
  createdAt?: number;
  updatedAt?: number;
  positions: Position[];
  closedPositions: ClosedPosition[];
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
