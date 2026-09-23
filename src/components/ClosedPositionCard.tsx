import React from 'react';
import { motion } from 'motion/react';
import { TrendingUp, TrendingDown, Trash2 } from 'lucide-react';
import { ClosedPosition } from '../types';
import { cn } from '../lib/utils';
import { formatCurrency, formatPercent } from './PositionCard';
import { SpotlightCard } from './SpotlightCard';

interface ClosedPositionCardProps {
  position: ClosedPosition;
  onRemove: (id: string) => void;
}

export function ClosedPositionCard({ position, onRemove }: ClosedPositionCardProps) {
  const isPositive = position.realizedReturn > 0;
  const isNegative = position.realizedReturn < 0;

  return (
    <SpotlightCard 
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      spotlightColor="rgba(255, 255, 255, 0.05)"
      borderColor="rgba(255, 255, 255, 0.2)"
      className="border border-white/[0.08] shadow-[0_8px_30px_rgb(0,0,0,0.5)]"
    >
      <div className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight">
                {position.shortName || position.symbol.replace(/\.TW(O)?$/, '')}
              </h3>
              <span className="text-xs font-mono font-medium text-[#A1A1A6] bg-white/[0.06] px-2 py-0.5 rounded-full border border-white/10">
                {position.symbol.replace(/\.TW(O)?$/, '')}
              </span>
              <span className="text-[11px] font-mono text-[#8E8E93] bg-white/[0.04] px-2 py-0.5 rounded-full border border-white/10">
                已平倉
              </span>
            </div>
            <p className="text-xs text-[#8E8E93] mt-1 font-mono flex items-center gap-1.5">
              <span>買進: {position.buyDate}</span>
              <span className="text-[#636366]">→</span>
              <span>賣出: {position.sellDate}</span>
            </p>
          </div>
          
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={() => onRemove(position.id)}
            className="text-[#8E8E93] hover:text-[#FF453A] hover:bg-rose-500/10 transition-colors p-1.5 rounded-full"
            title="刪除紀錄"
          >
            <Trash2 size={15} />
          </motion.button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
            <p className="label-text mb-1 text-[11px] text-[#8E8E93]">買進均價</p>
            <p className="font-semibold text-[#F5F5F7] text-base tabular-nums tracking-tight">{formatCurrency(position.buyPrice)}</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
            <p className="label-text mb-1 text-[11px] text-[#8E8E93]">賣出價格</p>
            <p className="font-semibold text-[#F5F5F7] text-base tabular-nums tracking-tight">
              {formatCurrency(position.sellPrice)}
            </p>
          </div>
        </div>

        <div className="flex items-end justify-between border-t border-white/[0.08] pt-3.5 mt-1">
          <div>
            <p className="text-xs text-[#8E8E93] mb-0.5">平倉股數: <span className="font-mono text-[#F5F5F7] font-medium">{position.shares.toLocaleString()}</span> 股</p>
            <p className="text-sm font-medium text-[#F5F5F7]">總成本: <span className="tabular-nums font-mono text-white">{formatCurrency(position.totalCost)}</span></p>
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
                <span>{isPositive ? '+' : ''}{formatPercent(position.realizedReturnPercent)}</span>
              </span>
            </div>
            <p className={cn("font-semibold text-lg tabular-nums tracking-tight", isPositive ? "text-[#30D158]" : (isNegative ? "text-[#FF453A]" : "text-[#F5F5F7]"))}>
               {isPositive ? '+' : ''}{formatCurrency(position.realizedReturn)}
            </p>
          </div>
        </div>
      </div>
    </SpotlightCard>
  );
}
