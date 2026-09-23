import React from 'react';
import { motion } from 'motion/react';
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
    <motion.div 
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      className="card-bg card-hover rounded-xl p-5 relative group overflow-hidden border border-white/8 hover:border-[#C5A059]/40"
    >
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#C5A059]/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-medium text-[#F3F4F6] tracking-tight">
              {position.shortName || position.symbol.replace(/\.TW(O)?$/, '')}
            </h3>
            <span className="text-xs font-mono font-medium text-[#C5A059] bg-[#C5A059]/10 px-2 py-0.5 rounded-md border border-[#C5A059]/20 shadow-xs">
              {position.symbol.replace(/\.TW(O)?$/, '')}
            </span>
            <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700">
              已平倉
            </span>
          </div>
          <p className="text-xs text-[#9CA3AF] mt-1 font-mono flex items-center gap-1.5">
            <span>買進: {position.buyDate}</span>
            <span className="text-[#6B7280]">→</span>
            <span>賣出: {position.sellDate}</span>
          </p>
        </div>
        
        <motion.button 
          whileTap={{ scale: 0.9 }}
          onClick={() => onRemove(position.id)}
          className="text-[#9CA3AF] hover:text-[#F87171] hover:bg-rose-500/10 transition-colors p-1.5 rounded-md"
          title="刪除紀錄"
        >
          <Trash2 size={16} />
        </motion.button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-[#101014]/90 rounded-lg p-3 border border-white/6 shadow-inner">
          <p className="label-text mb-1 text-[11px] text-[#9CA3AF]">買進均價</p>
          <p className="font-light serif text-[#E5E7EB] text-base tabular-nums">{formatCurrency(position.buyPrice)}</p>
        </div>
        <div className="bg-[#101014]/90 rounded-lg p-3 border border-white/6 shadow-inner">
          <p className="label-text mb-1 text-[11px] text-[#9CA3AF]">賣出價格</p>
          <p className="font-light serif text-[#E5E7EB] text-base tabular-nums">
            {formatCurrency(position.sellPrice)}
          </p>
        </div>
      </div>

      <div className="flex items-end justify-between border-t border-white/8 pt-3.5 mt-2">
        <div>
          <p className="label-text mb-0.5 text-[#9CA3AF]">平倉股數: <span className="font-mono text-[#E5E7EB] font-normal">{position.shares.toLocaleString()}</span> 股</p>
          <p className="text-sm font-light serif text-[#E5E7EB]">總成本: <span className="tabular-nums font-mono">{formatCurrency(position.totalCost)}</span></p>
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
              <span>{isPositive ? '+' : ''}{formatPercent(position.realizedReturnPercent)}</span>
            </span>
          </div>
          <p className={cn("font-medium serif text-lg tabular-nums tracking-tight", isPositive ? "green-glow" : (isNegative ? "red-glow" : "text-[#E5E7EB]"))}>
             {isPositive ? '+' : ''}{formatCurrency(position.realizedReturn)}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
