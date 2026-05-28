import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Position, QuoteData } from '../types';
import { cn } from '../lib/utils';

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat('zh-TW', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

interface PositionCardProps {
  position: Position & { history?: Position[] };
  quote?: QuoteData;
  onRemove: (id: string) => void;
  onSell: (position: Position, currentPrice?: number) => void;
}

export function PositionCard({ position, quote, onRemove, onSell }: PositionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const currentPrice = quote?.regularMarketPrice || position.buyPrice;
  const currentValue = currentPrice * position.shares;
  const returnAmount = currentValue - position.totalCost;
  const returnPercent = position.totalCost > 0 ? (returnAmount / position.totalCost) * 100 : 0;
  
  const isPositive = returnAmount > 0;
  const isNegative = returnAmount < 0;
  
  const hasHistory = position.history && position.history.length > 1;

  return (
    <div className="card-bg rounded-lg p-5 relative group transition-colors hover:border-[#333333]">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg text-[#E5E7EB] flex items-center gap-2">
            {quote?.shortName || position.symbol.replace(/\.TW(O)?$/, '')}
            <span className="text-xs font-mono text-[#6B7280] bg-[#1C1C1F] px-2 py-0.5 rounded border border-[#333333]">
              {position.symbol.replace(/\.TW(O)?$/, '')}
            </span>
          </h3>
          <p className="text-xs text-[#6B7280] mt-1 font-mono">
            買進日期: {position.buyDate}
          </p>
        </div>
        
        <div className="flex gap-2 items-center lg:opacity-0 lg:group-hover:opacity-100 opacity-100 transition-opacity">
          {!hasHistory && (
            <>
              <button 
                onClick={() => onSell(position, quote?.regularMarketPrice)}
                className="text-xs text-[#C5A059] border border-[#C5A059]/30 bg-[#1C1C1F] hover:bg-[#C5A059]/10 px-2 py-1 rounded transition-colors uppercase tracking-wider"
              >
                平倉
              </button>
              <button 
                onClick={() => onRemove(position.id)}
                className="text-[#6B7280] hover:text-[#F87171] transition-colors p-1"
                title="刪除紀錄"
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
          {hasHistory && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[#6B7280] hover:text-[#E5E7EB] flex items-center gap-1 text-xs px-2 py-1"
            >
              交易紀錄 {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-[#1C1C1F] rounded p-3 border border-[#333333]">
          <p className="label-text mb-1">買進均價</p>
          <p className="font-light serif text-[#E5E7EB]">{formatCurrency(position.buyPrice)}</p>
        </div>
        <div className="bg-[#1C1C1F] rounded p-3 border border-[#333333]">
          <p className="label-text mb-1">目前現價</p>
          <p className="font-light serif text-[#E5E7EB]">
            {quote ? formatCurrency(quote.regularMarketPrice) : '-'}
          </p>
        </div>
      </div>

      <div className="flex items-end justify-between border-t border-[#222226] pt-4 mt-2">
        <div>
          <p className="label-text mb-1">持有股數: {position.shares.toLocaleString()} 股</p>
          <p className="text-sm font-light serif text-[#E5E7EB]">市值: {formatCurrency(currentValue)}</p>
        </div>
        <div className={cn("text-right", isPositive ? "green-glow" : (isNegative ? "red-glow" : "text-[#E5E7EB]"))}>
          <div className="flex items-center justify-end gap-1 mb-0.5 serif text-sm">
             {isPositive ? <TrendingUp size={14} /> : (isNegative ? <TrendingDown size={14} /> : null)}
             <span>{isPositive ? '+' : ''}{formatPercent(returnPercent)}</span>
          </div>
          <p className="font-light serif text-lg">
             {isPositive ? '+' : ''}{formatCurrency(returnAmount)}
          </p>
        </div>
      </div>
      
      {hasHistory && isExpanded && (
        <div className="mt-4 pt-4 border-t border-[#222226] space-y-3">
          <p className="text-xs text-[#6B7280] mb-2">個別交易紀錄</p>
          {position.history!.map((histPos) => (
            <div key={histPos.id} className="flex justify-between items-center bg-[#1C1C1F] p-3 rounded border border-[#333333]">
              <div>
                <p className="text-sm text-[#E5E7EB]">{histPos.buyDate}</p>
                <p className="text-xs text-[#6B7280]">{histPos.shares.toLocaleString()} 股 @ {formatCurrency(histPos.buyPrice)}</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => onSell(histPos, quote?.regularMarketPrice)}
                  className="text-xs text-[#C5A059] border border-[#C5A059]/30 hover:bg-[#C5A059]/10 px-2 py-1 rounded transition-colors"
                >
                  平倉
                </button>
                <button 
                  onClick={() => onRemove(histPos.id)}
                  className="text-[#6B7280] hover:text-[#F87171] transition-colors p-1"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
