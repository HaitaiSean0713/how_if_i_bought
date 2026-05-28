import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
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
    if (!sellDate || !sellPrice || !sellShares) return;

    setIsLoading(true);
    setError('');

    try {
      const parsedPrice = parseFloat(sellPrice);
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        throw new Error('請輸入有效的賣出價格');
      }

      const parsedShares = parseFloat(sellShares);
      if (isNaN(parsedShares) || parsedShares <= 0 || (position && parsedShares > position.shares)) {
        throw new Error('請輸入有效的賣出股數 (大於 0 且不高於持股數)');
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="card-bg rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center p-6 border-b border-[#222226]">
          <h2 className="text-xl serif gold-text">平倉 (賣出)</h2>
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
          
          <div className="mb-4">
            <p className="text-[#E5E7EB] serif">{position.symbol.replace(/\.TW(O)?$/, '')}</p>
            <p className="text-sm text-[#6B7280]">持有股數: {position.shares.toLocaleString()}</p>
            <p className="text-sm text-[#6B7280]">買進均價: {position.buyPrice}</p>
          </div>

          <div className="space-y-1.5">
            <label className="block label-text">賣出股數 (最大: {position.shares.toLocaleString()})</label>
            <input
              type="number"
              value={sellShares}
              onChange={(e) => setSellShares(e.target.value)}
              step="any"
              min="0.000001"
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
      </div>
    </div>
  );
}
