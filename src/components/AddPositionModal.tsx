import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Search } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

interface AddPositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (position: Omit<import('../types').Position, 'id' | 'totalCost'>) => Promise<void>;
}

export function AddPositionModal({ isOpen, onClose, onAdd }: AddPositionModalProps) {
  const [symbol, setSymbol] = useState('');
  const [shares, setShares] = useState('');
  const [buyDate, setBuyDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || !symbol || !shares || !buyDate) return;

    setIsLoading(true);
    setError('');

    try {
      // Input Validation
      const parsedShares = Number(shares);
      if (!Number.isSafeInteger(parsedShares) || parsedShares <= 0) {
        throw new Error('請輸入有效的股數 (例如: 1000代表一張)');
      }

      const { resolveStockSymbol } = await import('../lib/taiwanStocks');
      const resolved = resolveStockSymbol(symbol);
      const querySymbol = resolved ? resolved.symbol : symbol.toUpperCase();

      // Fetch historical data to get buy price
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      let response: Response;
      try {
        response = await fetch(`/api/historical/${encodeURIComponent(querySymbol)}/${buyDate}?t=${Date.now()}`, {
          signal: controller.signal
        });
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          throw new Error('查詢超時，請稍後再試（Yahoo Finance 回應過慢）');
        }
        throw new Error('網路連線失敗，請確認伺服器已啟動');
      }
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '無法獲取該日期的歷史股價');
      }

      const historicalData = await response.json();
      
      if (!historicalData || !Number.isFinite(historicalData.close) || historicalData.close <= 0) {
          throw new Error('找不到歷史股價，請確認日期是否為交易日或代碼是否正確。');
      }

      await onAdd({
        symbol: historicalData.actualSymbol || querySymbol,
        shortName: resolved?.shortName || historicalData.shortName,
        shares: parsedShares,
        buyDate,
        buyPrice: historicalData.close,
      });

      // Reset and close immediately
      setSymbol('');
      setShares('');
      setBuyDate(format(new Date(), 'yyyy-MM-dd'));
      onClose();
    } catch (err: any) {
      setError(err.message || '新增失敗');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4"
      onMouseDown={(e) => {
        if (!isLoading && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: 'spring', duration: 0.3, bounce: 0.1 }}
        className="card-bg rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-white/10"
      >
        <div className="flex justify-between items-center p-6 border-b border-white/8 bg-white/2">
          <h2 className="text-xl serif gold-gradient-text font-medium">新增部位</h2>
          <button onClick={onClose} disabled={isLoading} className="text-[#9CA3AF] hover:text-white transition-colors p-1 rounded-md hover:bg-white/5">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-950/40 text-rose-300 text-sm rounded-xl border border-rose-900/60 leading-relaxed">
              {error}
            </div>
          )}
          
          <div className="space-y-1.5">
            <label className="block label-text text-[#9CA3AF]">股票代號或名稱</label>
            <div className="relative">
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="例如: 2330 或 台積電、元大台灣50"
                className="input-field uppercase placeholder:normal-case placeholder:text-[#6B7280]/60"
                required
              />
            </div>
            <p className="text-xs text-[#9CA3AF]">支援上市櫃 2,700+ 檔標的名稱自動解析</p>
          </div>

          <div className="space-y-1.5">
            <label className="block label-text text-[#9CA3AF]">股數</label>
            <input
              type="number"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="例如: 1000 (代表一張)"
              className="input-field placeholder:text-[#6B7280]/60 font-mono"
              required
              min="1"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block label-text text-[#9CA3AF]">買進日期</label>
            <input
              type="date"
              value={buyDate}
              onChange={(e) => setBuyDate(e.target.value)}
              max={format(new Date(), 'yyyy-MM-dd')}
              className="input-field [color-scheme:dark] font-mono"
              required
            />
          </div>

          <div className="pt-3">
            <motion.button
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={isLoading}
              className={cn(
                "action-btn w-full py-3 text-sm font-semibold shadow-lg",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
            >
              {isLoading ? '查詢歷史股價並新增中...' : '確認新增持倉'}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
