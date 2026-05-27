import React, { useState } from 'react';
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
    if (!symbol || !shares || !buyDate) return;

    setIsLoading(true);
    setError('');

    // 最終保險：無論如何，10 秒後強制解除 loading 狀態
    const safetyTimer = setTimeout(() => {
      setIsLoading(false);
      setError('操作逾時，請重試');
    }, 10000);

    try {
      // Input Validation
      const parsedShares = parseInt(shares);
      if (isNaN(parsedShares) || parsedShares <= 0) {
        throw new Error('請輸入有效的股數 (例如: 1000代表一張)');
      }

      // Fetch historical data to get buy price
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      let response: Response;
      try {
        response = await fetch(`/api/historical/${symbol}/${buyDate}`, {
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
      
      if (!historicalData || !historicalData.close) {
          throw new Error('找不到歷史股價，請確認日期是否為交易日或代碼是否正確。');
      }

      onAdd({
        symbol: historicalData.actualSymbol || symbol.toUpperCase(),
        shortName: historicalData.shortName,
        shares: parsedShares,
        buyDate,
        buyPrice: historicalData.close,
      }).catch((err: any) => {
        console.error('Error adding position:', err);
      });

      // Reset and close immediately
      setSymbol('');
      setShares('');
      setBuyDate(format(new Date(), 'yyyy-MM-dd'));
      onClose();
    } catch (err: any) {
      setError(err.message || '新增失敗');
    } finally {
      clearTimeout(safetyTimer);
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="card-bg rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center p-6 border-b border-[#222226]">
          <h2 className="text-xl serif gold-text">新增持倉</h2>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#E5E7EB] transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-900/20 text-[#F87171] text-sm rounded border border-red-900/50">
              {error}
            </div>
          )}
          
          <div className="space-y-1.5">
            <label className="block label-text">股票代號</label>
            <div className="relative">
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.replace(/[^a-zA-Z0-9\.\-\^]/g, ''))}
                placeholder="例如: 2330"
                className="input-field transition-colors focus:border-[#C5A059] outline-none uppercase placeholder:normal-case placeholder:text-[#6B7280]/50"
                required
              />
            </div>
            <p className="text-xs text-[#6B7280]">台股請直接輸入代號 (例如 2330)</p>
          </div>

          <div className="space-y-1.5">
            <label className="block label-text">股數</label>
            <input
              type="number"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="例如: 1000 (代表一張)"
              className="input-field transition-colors focus:border-[#C5A059] outline-none placeholder:text-[#6B7280]/50"
              required
              min="1"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block label-text">買進日期</label>
            <input
              type="date"
              value={buyDate}
              onChange={(e) => setBuyDate(e.target.value)}
              max={format(new Date(), 'yyyy-MM-dd')}
              className="input-field transition-colors focus:border-[#C5A059] outline-none [color-scheme:dark]"
              required
            />
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                "action-btn w-full",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
            >
              {isLoading ? '處理中...' : '確認新增'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
