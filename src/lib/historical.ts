export function taiwanDate(value: string | number | Date): string {
  return new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function validHistoricalDate(value: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= taiwanDate(now);
}

export function historicalRange(date: string) {
  const timestamp = new Date(`${date}T00:00:00Z`).getTime();
  return {
    period1: new Date(timestamp - 14 * 86400000).toISOString().slice(0, 10),
    period2: new Date(timestamp + 86400000).toISOString().slice(0, 10),
  };
}

// Never substitute a future bar or today's quote for missing historical data.
export function selectHistoricalQuote<T extends { date: Date | string; close: number | null }>(quotes: T[], date: string): T | undefined {
  return quotes.filter(q => Number.isFinite(q.close) && q.close! > 0 && Number.isFinite(new Date(q.date).getTime()) && taiwanDate(q.date) <= date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
}
