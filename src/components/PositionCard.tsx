import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TrendingUp, TrendingDown, Trash2, ChevronDown, ChevronUp, Layers } from 'lucide-react';
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
    <motion.div 
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      className="card-bg card-hover rounded-xl p-5 relative group overflow-hidden border border-white/8 hover:border-[#C5A059]/40"
    >
      {/* Top subtle light accent */}
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#C5A059]/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-medium text-[#F3F4F6] tracking-tight">
              {quote?.shortName || position.symbol.replace(/\.TW(O)?$/, '')}
            </h3>
            <span className="text-xs font-mono font-medium text-[#C5A059] bg-[#C5A059]/10 px-2 py-0.5 rounded-md border border-[#C5A059]/20 shadow-xs">
              {position.symbol.replace(/\.TW(O)?$/, '')}
            </span>
            {hasHistory && (
              <span className="text-[10px] font-mono text-[#9CA3AF] bg-white/5 px-1.5 py-0.5 rounded border border-white/10 flex items-center gap-1">
                <Layers size={10} /> {position.history?.length} 批
              </span>
            )}
          </div>
          <p className="text-xs text-[#9CA3AF] mt-1 font-mono flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#C5A059]/60" />
            買進日期: {position.buyDate}
          </p>
        </div>
        
        <div className="flex gap-1.5 items-center">
          {!hasHistory ? (
            <>
              <motion.button 
                whileTap={{ scale: 0.95 }}
                onClick={() => onSell(position, quote?.regularMarketPrice)}
                className="text-xs font-medium text-[#C5A059] border border-[#C5A059]/40 bg-[#C5A059]/10 hover:bg-[#C5A059]/20 px-2.5 py-1 rounded-md transition-all uppercase tracking-wider"
              >
                平倉
              </motion.button>
              <motion.button 
                whileTap={{ scale: 0.9 }}
                onClick={() => onRemove(position.id)}
                className="text-[#9CA3AF] hover:text-[#F87171] hover:bg-red-500/10 transition-colors p-1.5 rounded-md"
                title="刪除紀錄"
              >
                <Trash2 size={16} />
              </motion.button>
            </>
          ) : (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[#9CA3AF] hover:text-[#E5E7EB] bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1 text-xs px-2.5 py-1 rounded-md transition-colors font-medium"
            >
              明細 {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </motion.button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-[#101014]/90 rounded-lg p-3 border border-white/6 shadow-inner">
          <p className="label-text mb-1 text-[11px] text-[#9CA3AF]">買進均價</p>
          <p className="font-light serif text-[#E5E7EB] text-base tabular-nums">{formatCurrency(position.buyPrice)}</p>
        </div>
        <div className="bg-[#101014]/90 rounded-lg p-3 border border-white/6 shadow-inner">
          <p className="label-text mb-1 text-[11px] text-[#9CA3AF]">目前現價</p>
          <p className="font-light serif text-[#E5E7EB] text-base tabular-nums flex items-baseline gap-1.5">
            {quote ? formatCurrency(quote.regularMarketPrice) : '-'}
            {quote && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="即時市場行情" />
            )}
          </p>
        </div>
      </div>

      <div className="flex items-end justify-between border-t border-white/8 pt-3.5 mt-2">
        <div>
          <p className="label-text mb-0.5 text-[#9CA3AF]">持有股數: <span className="font-mono text-[#E5E7EB] font-normal">{position.shares.toLocaleString()}</span> 股</p>
          <p className="text-sm font-light serif text-[#E5E7EB]">市值: <span className="tabular-nums font-mono">{formatCurrency(currentValue)}</span></p>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1 mb-1">
            <span className={cn(
              "inline-flex items-center gap-1 text-xs font-mono font-medium px-2 py-0.5 rounded-full border shadow-xs",
              isPositive 
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" 
                : (isNegative ? "bg-rose-500/15 border-rose-500/30 text-rose-400" : "bg-zinc-800 border-zinc-700 text-zinc-300")
            )}>
              {isPositive ? <TrendingUp size={12} /> : (isNegative ? <TrendingDown size={12} /> : null)}
              <span>{isPositive ? '+' : ''}{formatPercent(returnPercent)}</span>
            </span>
          </div>
          <p className={cn("font-medium serif text-lg tabular-nums tracking-tight", isPositive ? "green-glow" : (isNegative ? "red-glow" : "text-[#E5E7EB]"))}>
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
            className="mt-4 pt-4 border-t border-white/8 space-y-2.5 overflow-hidden"
          >
            <p className="text-xs font-medium text-[#C5A059] flex items-center gap-1.5">
              <Layers size={12} /> 歷史買進明細
            </p>
            {position.history!.map((histPos) => (
              <div key={histPos.id} className="flex justify-between items-center bg-[#101014]/90 p-2.5 rounded-lg border border-white/6 hover:border-white/10 transition-colors">
                <div>
                  <p className="text-xs text-[#E5E7EB] font-mono">{histPos.buyDate}</p>
                  <p className="text-xs text-[#9CA3AF] font-mono">{histPos.shares.toLocaleString()} 股 @ {formatCurrency(histPos.buyPrice)}</p>
                </div>
                <div className="flex gap-1.5">
                  <button 
                    onClick={() => onSell(histPos, quote?.regularMarketPrice)}
                    className="text-xs text-[#C5A059] border border-[#C5A059]/30 hover:bg-[#C5A059]/15 px-2 py-0.5 rounded transition-colors"
                  >
                    平倉
                  </button>
                  <button 
                    onClick={() => onRemove(histPos.id)}
                    className="text-[#9CA3AF] hover:text-[#F87171] hover:bg-rose-500/10 transition-colors p-1 rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
