import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TrendingUp, TrendingDown, Trash2, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { Position, QuoteData } from '../types';
import { cn } from '../lib/utils';
import { SpotlightCard } from './SpotlightCard';

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
    <SpotlightCard 
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      spotlightColor="rgba(255, 255, 255, 0.06)"
      borderColor="rgba(255, 255, 255, 0.25)"
      className="border border-white/[0.08] shadow-[0_8px_30px_rgb(0,0,0,0.5)]"
    >
      <div className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight">
                {quote?.shortName || position.symbol.replace(/\.TW(O)?$/, '')}
              </h3>
              <span className="text-xs font-mono font-medium text-[#A1A1A6] bg-white/[0.06] px-2 py-0.5 rounded-full border border-white/10">
                {position.symbol.replace(/\.TW(O)?$/, '')}
              </span>
              {hasHistory && (
                <span className="text-[11px] font-mono text-[#A1A1A6] bg-white/[0.04] px-2 py-0.5 rounded-full border border-white/10 flex items-center gap-1">
                  <Layers size={11} /> {position.history?.length} 批
                </span>
              )}
            </div>
            <p className="text-xs text-[#8E8E93] mt-1 font-mono flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/40" />
              買進日期: {position.buyDate}
            </p>
          </div>
          
          <div className="flex gap-1.5 items-center">
            {!hasHistory ? (
              <>
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onSell(position, quote?.regularMarketPrice)}
                  className="text-xs font-medium text-white border border-white/20 bg-white/10 hover:bg-white/15 px-3 py-1 rounded-full transition-all tracking-tight"
                >
                  平倉
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onRemove(position.id)}
                  className="text-[#8E8E93] hover:text-[#FF453A] hover:bg-rose-500/10 transition-colors p-1.5 rounded-full"
                  title="刪除紀錄"
                >
                  <Trash2 size={15} />
                </motion.button>
              </>
            ) : (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-[#A1A1A6] hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1 text-xs px-3 py-1 rounded-full transition-colors font-medium"
              >
                明細 {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </motion.button>
            )}
          </div>
        </div>

        {/* Price Metrics Grid */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
            <p className="label-text mb-1 text-[11px] text-[#8E8E93]">買進均價</p>
            <p className="font-semibold text-[#F5F5F7] text-base tabular-nums tracking-tight">{formatCurrency(position.buyPrice)}</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
            <p className="label-text mb-1 text-[11px] text-[#8E8E93]">目前現價</p>
            <p className="font-semibold text-[#F5F5F7] text-base tabular-nums tracking-tight flex items-baseline gap-1.5">
              {quote ? formatCurrency(quote.regularMarketPrice) : '-'}
              {quote && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="即時市場行情" />
              )}
            </p>
          </div>
        </div>

        {/* Footer Totals */}
        <div className="flex items-end justify-between border-t border-white/[0.08] pt-3.5 mt-1">
          <div>
            <p className="text-xs text-[#8E8E93] mb-0.5">持有股數: <span className="font-mono text-[#F5F5F7] font-medium">{position.shares.toLocaleString()}</span> 股</p>
            <p className="text-sm font-medium text-[#F5F5F7]">市值: <span className="tabular-nums font-mono text-white">{formatCurrency(currentValue)}</span></p>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 mb-1">
              <span className={cn(
                "inline-flex items-center gap-1 text-xs font-mono font-medium px-2.5 py-0.5 rounded-full border",
                isPositive 
                  ? "bg-emerald-500/15 border-emerald-500/30 text-[#30D158]" 
                  : (isNegative ? "bg-rose-500/15 border-rose-500/30 text-[#FF453A]" : "bg-white/5 border-white/10 text-[#8E8E93]")
              )}>
                {isPositive ? <TrendingUp size={12} /> : (isNegative ? <TrendingDown size={12} /> : null)}
                <span>{isPositive ? '+' : ''}{formatPercent(returnPercent)}</span>
              </span>
            </div>
            <p className={cn("font-semibold text-lg tabular-nums tracking-tight", isPositive ? "text-[#30D158]" : (isNegative ? "text-[#FF453A]" : "text-[#F5F5F7]"))}>
               {isPositive ? '+' : ''}{formatCurrency(returnAmount)}
            </p>
          </div>
        </div>
        
        <AnimatePresence>
          {hasHistory && isExpanded && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-4 pt-4 border-t border-white/[0.08] space-y-2 overflow-hidden"
            >
              <p className="text-xs font-medium text-[#A1A1A6] flex items-center gap-1.5">
                <Layers size={12} /> 歷史買進明細
              </p>
              {position.history!.map((histPos) => (
                <div key={histPos.id} className="flex justify-between items-center bg-white/[0.03] p-2.5 rounded-xl border border-white/[0.06] hover:border-white/15 transition-colors">
                  <div>
                    <p className="text-xs text-[#F5F5F7] font-mono">{histPos.buyDate}</p>
                    <p className="text-xs text-[#8E8E93] font-mono">{histPos.shares.toLocaleString()} 股 @ {formatCurrency(histPos.buyPrice)}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button 
                      onClick={() => onSell(histPos, quote?.regularMarketPrice)}
                      className="text-xs text-white border border-white/20 hover:bg-white/10 px-2.5 py-0.5 rounded-full transition-colors"
                    >
                      平倉
                    </button>
                    <button 
                      onClick={() => onRemove(histPos.id)}
                      className="text-[#8E8E93] hover:text-[#FF453A] hover:bg-rose-500/10 transition-colors p-1 rounded-full"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SpotlightCard>
  );
}
