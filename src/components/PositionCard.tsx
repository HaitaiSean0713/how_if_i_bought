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
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      spotlightColor="rgba(255, 255, 255, 0.08)"
      borderColor="rgba(255, 255, 255, 0.28)"
      className="border border-white/[0.14] shadow-[0_8px_30px_rgb(0,0,0,0.5)]"
      innerClassName="bg-[#1e1f32] border-white/[0.14]"
    >
      <div className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                {quote?.shortName || position.symbol.replace(/\.TW(O)?$/, '')}
              </h3>
              <span className="text-xs font-mono font-semibold text-white bg-white/10 px-2 py-0.5 rounded-full border border-white/20">
                {position.symbol.replace(/\.TW(O)?$/, '')}
              </span>
              {hasHistory && (
                <span className="text-[11px] font-mono text-[#D1D1D6] bg-white/[0.08] px-2 py-0.5 rounded-full border border-white/15 flex items-center gap-1 font-medium">
                  <Layers size={11} /> {position.history?.length} 批
                </span>
              )}
            </div>
            <p className="text-xs text-[#D1D1D6] mt-1 font-mono flex items-center gap-1.5 font-medium">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400" />
              買進日期: {position.buyDate}
            </p>
          </div>
          
          <div className="flex gap-1.5 items-center">
            {!hasHistory ? (
              <>
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onSell(position, quote?.regularMarketPrice)}
                  className="text-xs font-medium text-white border border-white/25 bg-white/15 hover:bg-white/25 px-3 py-1 rounded-full transition-all tracking-tight"
                >
                  平倉
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onRemove(position.id)}
                  className="text-[#A1A1A6] hover:text-[#FF453A] hover:bg-rose-500/10 transition-colors p-1.5 rounded-full"
                  title="刪除紀錄"
                >
                  <Trash2 size={15} />
                </motion.button>
              </>
            ) : (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-white hover:text-white bg-white/10 hover:bg-white/20 border border-white/20 flex items-center gap-1 text-xs px-3 py-1 rounded-full transition-colors font-medium"
              >
                明細 {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </motion.button>
            )}
          </div>
        </div>

        {/* Price Metrics Grid */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <div className="bg-[#292a40] rounded-xl p-3 border border-white/[0.12] shadow-xs">
            <p className="mb-1 text-xs text-[#D1D1D6] font-medium">買進均價</p>
            <p className="font-bold text-white text-base tabular-nums tracking-tight">{formatCurrency(position.buyPrice)}</p>
          </div>
          <div className="bg-[#292a40] rounded-xl p-3 border border-white/[0.12] shadow-xs">
            <p className="mb-1 text-xs text-[#D1D1D6] font-medium">目前現價</p>
            <p className="font-bold text-white text-base tabular-nums tracking-tight flex items-baseline gap-1.5">
              {quote ? formatCurrency(quote.regularMarketPrice) : '-'}
              {quote && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="即時市場行情" />
              )}
            </p>
          </div>
        </div>

        {/* Footer Totals */}
        <div className="flex items-end justify-between border-t border-white/[0.12] pt-3.5 mt-1">
          <div>
            <p className="text-xs text-[#D1D1D6] mb-0.5">持有股數: <span className="font-mono text-white font-semibold">{position.shares.toLocaleString()}</span> 股</p>
            <p className="text-sm font-medium text-[#D1D1D6]">市值: <span className="tabular-nums font-mono text-white font-bold">{formatCurrency(currentValue)}</span></p>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 mb-1">
              <span className={cn(
                "inline-flex items-center gap-1 text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full border",
                isPositive 
                  ? "bg-emerald-500/20 border-emerald-400/40 text-[#30D158]" 
                  : (isNegative ? "bg-rose-500/20 border-rose-400/40 text-[#FF453A]" : "bg-white/10 border-white/20 text-[#D1D1D6]")
              )}>
                {isPositive ? <TrendingUp size={12} /> : (isNegative ? <TrendingDown size={12} /> : null)}
                <span>{isPositive ? '+' : ''}{formatPercent(returnPercent)}</span>
              </span>
            </div>
            <p className={cn("font-bold text-xl tabular-nums tracking-tight", isPositive ? "text-[#30D158]" : (isNegative ? "text-[#FF453A]" : "text-white"))}>
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
              className="mt-4 pt-4 border-t border-white/[0.12] space-y-2 overflow-hidden"
            >
              <p className="text-xs font-medium text-white flex items-center gap-1.5">
                <Layers size={12} /> 歷史買進明細
              </p>
              {position.history!.map((histPos) => (
                <div key={histPos.id} className="flex justify-between items-center bg-[#292a40] p-2.5 rounded-xl border border-white/[0.12] hover:border-white/25 transition-colors">
                  <div>
                    <p className="text-xs text-white font-mono font-medium">{histPos.buyDate}</p>
                    <p className="text-xs text-[#D1D1D6] font-mono">{histPos.shares.toLocaleString()} 股 @ {formatCurrency(histPos.buyPrice)}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button 
                      onClick={() => onSell(histPos, quote?.regularMarketPrice)}
                      className="text-xs text-white border border-white/25 hover:bg-white/15 px-2.5 py-0.5 rounded-full transition-colors font-medium"
                    >
                      平倉
                    </button>
                    <button 
                      onClick={() => onRemove(histPos.id)}
                      className="text-[#A1A1A6] hover:text-[#FF453A] hover:bg-rose-500/10 transition-colors p-1 rounded-full"
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
