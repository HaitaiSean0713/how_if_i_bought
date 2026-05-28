import React from 'react';
import { TrendingUp, TrendingDown, Trash2 } from 'lucide-react';
import { ClosedPosition } from '../types';
import { cn } from '../lib/utils';
import { formatCurrency, formatPercent } from './PositionCard';

interface ClosedPositionCardProps {
  position: ClosedPosition;
  onRemove: (id: string) => void;
}

export function ClosedPositionCard({ position, onRemove }: ClosedPositionCardProps) {
  const isPositive = position.realizedReturn > 0;
  const isNegative = position.realizedReturn < 0;

  return (
    <div className="card-bg rounded-lg p-5 relative group transition-colors hover:border-[#333333]">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg text-[#E5E7EB] flex items-center gap-2">
            {position.shortName || position.symbol.replace(/\.TW(O)?$/, '')}
            <span className="text-xs font-mono text-[#6B7280] bg-[#1C1C1F] px-2 py-0.5 rounded border border-[#333333]">
              {position.symbol.replace(/\.TW(O)?$/, '')}
            </span>
          </h3>
          <p className="text-xs text-[#6B7280] mt-1 font-mono">
            買進: {position.buyDate} | 賣出: {position.sellDate}
          </p>
        </div>
        
        <button 
          onClick={() => onRemove(position.id)}
          className="text-[#6B7280] hover:text-[#F87171] transition-colors lg:opacity-0 lg:group-hover:opacity-100 opacity-100 p-1"
          title="刪除紀錄"
        >
          <Trash2 size={18} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-[#1C1C1F] rounded p-3 border border-[#333333]">
          <p className="label-text mb-1">買進均價</p>
          <p className="font-light serif text-[#E5E7EB]">{formatCurrency(position.buyPrice)}</p>
        </div>
        <div className="bg-[#1C1C1F] rounded p-3 border border-[#333333]">
          <p className="label-text mb-1">賣出價格</p>
          <p className="font-light serif text-[#E5E7EB]">
            {formatCurrency(position.sellPrice)}
          </p>
        </div>
      </div>

      <div className="flex items-end justify-between border-t border-[#222226] pt-4 mt-2">
        <div>
          <p className="label-text mb-1">平倉股數: {position.shares.toLocaleString()} 股</p>
          <p className="text-sm font-light serif text-[#E5E7EB]">總成本: {formatCurrency(position.totalCost)}</p>
        </div>
        <div className={cn("text-right", isPositive ? "green-glow" : (isNegative ? "red-glow" : "text-[#E5E7EB]"))}>
          <div className="flex items-center justify-end gap-1 mb-0.5 serif text-sm">
             {isPositive ? <TrendingUp size={14} /> : (isNegative ? <TrendingDown size={14} /> : null)}
             <span>{isPositive ? '+' : ''}{formatPercent(position.realizedReturnPercent)}</span>
          </div>
          <p className="font-light serif text-lg">
             {isPositive ? '+' : ''}{formatCurrency(position.realizedReturn)}
          </p>
        </div>
      </div>
    </div>
  );
}
