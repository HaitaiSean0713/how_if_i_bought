import type { Portfolio } from '../types';

// Stable IDs make retries safe after a partially completed migration.
export async function migrateGuestPortfolios(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  userId: string,
  createIfMissing: (portfolio: Portfolio) => Promise<void>,
) {
  const raw = storage.getItem('portfolios_guest');
  if (!raw) return;
  const portfolios: Portfolio[] = JSON.parse(raw);
  if (!Array.isArray(portfolios)) throw new Error('訪客資料格式不正確');
  for (const portfolio of portfolios) {
    await createIfMissing({ ...portfolio, id: `${userId}_${portfolio.id}`, userId });
  }
  // Retain the complete local copy on any failure or concurrent local edit.
  if (storage.getItem('portfolios_guest') === raw) {
    storage.removeItem('portfolios_guest');
    storage.removeItem('active_portfolio_id_guest');
  }
}
