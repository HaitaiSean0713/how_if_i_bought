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
                {position.shortName || position.symbol.replace(/\.TW(O)?$/, '')}
              </h3>
              <span className="text-xs font-mono font-semibold text-white bg-white/10 px-2 py-0.5 rounded-full border border-white/20">
                {position.symbol.replace(/\.TW(O)?$/, '')}
              </span>
              <span className="text-[11px] font-mono text-[#D1D1D6] bg-white/[0.08] px-2 py-0.5 rounded-full border border-white/15 font-medium">
                已平倉
              </span>
            </div>
            <p className="text-xs text-[#D1D1D6] mt-1 font-mono flex items-center gap-1.5 font-medium">
              <span>買進: {position.buyDate}</span>
              <span className="text-white/40">→</span>
              <span>賣出: {position.sellDate}</span>
            </p>
          </div>
          
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={() => onRemove(position.id)}
            className="text-[#A1A1A6] hover:text-[#FF453A] hover:bg-rose-500/10 transition-colors p-1.5 rounded-full"
            title="刪除紀錄"
          >
            <Trash2 size={15} />
          </motion.button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <div className="bg-[#292a40] rounded-xl p-3 border border-white/[0.12] shadow-xs">
            <p className="mb-1 text-xs text-[#D1D1D6] font-medium">買進均價</p>
            <p className="font-bold text-white text-base tabular-nums tracking-tight">{formatCurrency(position.buyPrice)}</p>
          </div>
          <div className="bg-[#292a40] rounded-xl p-3 border border-white/[0.12] shadow-xs">
            <p className="mb-1 text-xs text-[#D1D1D6] font-medium">賣出價格</p>
            <p className="font-bold text-white text-base tabular-nums tracking-tight">
              {formatCurrency(position.sellPrice)}
            </p>
          </div>
        </div>

        <div className="flex items-end justify-between border-t border-white/[0.12] pt-3.5 mt-1">
          <div>
            <p className="text-xs text-[#D1D1D6] mb-0.5">平倉股數: <span className="font-mono text-white font-semibold">{position.shares.toLocaleString()}</span> 股</p>
            <p className="text-sm font-medium text-[#D1D1D6]">總成本: <span className="tabular-nums font-mono text-white font-bold">{formatCurrency(position.totalCost)}</span></p>
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
                <span>{isPositive ? '+' : ''}{formatPercent(position.realizedReturnPercent)}</span>
              </span>
            </div>
            <p className={cn("font-bold text-xl tabular-nums tracking-tight", isPositive ? "text-[#30D158]" : (isNegative ? "text-[#FF453A]" : "text-white"))}>
               {isPositive ? '+' : ''}{formatCurrency(position.realizedReturn)}
            </p>
          </div>
        </div>
      </div>
    </SpotlightCard>
  );
}
