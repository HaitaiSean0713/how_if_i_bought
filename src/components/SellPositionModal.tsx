import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, TrendingDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { Position } from '../types';

interface SellPositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: Position | null;
  currentPrice?: number;
  onConfirm: (sellDate: string, sellPrice: number, sellShares: number) => Promise<void>;
}

export function SellPositionModal({ isOpen, onClose, position, currentPrice, onConfirm }: SellPositionModalProps) {
  const [sellDate, setSellDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [sellPrice, setSellPrice] = useState('');
  const [sellShares, setSellShares] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      setSellDate(format(new Date(), 'yyyy-MM-dd'));
      if (currentPrice) {
        setSellPrice(currentPrice.toString());
      } else {
        setSellPrice('');
      }
      if (position) {
        setSellShares(position.shares.toString());
      }
    } else {
      setSellPrice('');
      setSellShares('');
    }
  }, [isOpen, currentPrice, position]);

  if (!isOpen || !position) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || !sellDate || !sellPrice || !sellShares) return;

    setIsLoading(true);
    setError('');

    try {
      if (sellDate < position.buyDate || sellDate > format(new Date(), 'yyyy-MM-dd')) {
        throw new Error('賣出日期不得早於買進日期或晚於今天');
      }
      const parsedPrice = parseFloat(sellPrice);
      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        throw new Error('請輸入有效的賣出價格');
      }

      const parsedShares = parseFloat(sellShares);
      if (isNaN(parsedShares) || !Number.isInteger(parsedShares) || parsedShares <= 0 || (position && parsedShares > position.shares)) {
        throw new Error('請輸入有效的賣出股數 (必須為整數且不高於持股數)');
      }

      await onConfirm(sellDate, parsedPrice, parsedShares);

      setSellDate(format(new Date(), 'yyyy-MM-dd'));
      onClose();
    } catch (err: any) {
      setError(err.message || '平倉失敗');
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
        transition={{ type: "spring", stiffness: 350, damping: 25 }}
        className="apple-glass rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-white/10"
      >
        <div className="flex justify-between items-center p-6 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 text-[#FF453A]">
              <TrendingDown size={18} />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-white apple-title">部位平倉 (賣出)</h2>
          </div>
          <button onClick={onClose} disabled={isLoading} aria-label="關閉" className="p-1.5 rounded-full text-[#8E8E93] hover:text-white hover:bg-white/10 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-950/40 text-rose-300 text-xs rounded-2xl border border-rose-900/60 leading-relaxed">
              {error}
            </div>
          )}
          
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-[#222226] space-y-1">
            <p className="text-sm font-semibold text-[#E5E7EB] serif">{position.symbol.replace(/\.TW(O)?$/, '')}</p>
            <div className="flex justify-between text-xs text-[#9CA3AF]">
              <span>持有股數: <strong className="font-mono text-white">{position.shares.toLocaleString()}</strong> 股</span>
              <span>買進均價: <strong className="font-mono text-white">${position.buyPrice}</strong></span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block label-text">賣出股數 (最大: {position.shares.toLocaleString()})</label>
            <input
              type="number"
              value={sellShares}
              onChange={(e) => setSellShares(e.target.value)}
              step="1"
              min="1"
              max={position.shares}
              placeholder={`最大: ${position.shares}`}
              className="input-field transition-colors focus:border-[#C5A059] outline-none"
              required
            />
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => setSellShares(Math.floor(position.shares / 2).toString())}
                className="px-2 py-1 text-xs rounded bg-[#1C1C1F] text-[#6B7280] hover:text-[#C5A059] hover:bg-[#222226] transition-colors"
              >
                1/2 股數
              </button>
              <button
                type="button"
                onClick={() => setSellShares(position.shares.toString())}
                className="px-2 py-1 text-xs rounded bg-[#1C1C1F] text-[#6B7280] hover:text-[#C5A059] hover:bg-[#222226] transition-colors"
              >
                全部股數
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block label-text">賣出日期</label>
            <input
              type="date"
              value={sellDate}
              min={position.buyDate}
              onChange={(e) => setSellDate(e.target.value)}
              max={format(new Date(), 'yyyy-MM-dd')}
              className="input-field transition-colors focus:border-[#C5A059] outline-none [color-scheme:dark]"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block label-text">賣出價格</label>
            <input
              type="number"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              step="0.01"
              min="0"
              placeholder="例如: 600"
              className="input-field transition-colors focus:border-[#C5A059] outline-none"
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
              {isLoading ? '處理中...' : '確認賣出'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
