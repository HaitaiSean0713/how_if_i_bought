import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, FolderOpen, Coins, Trash2, ArrowRight } from 'lucide-react';
import { Portfolio } from '../types';

interface GroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupName: string;
  initialCapital?: number;
  memberPortfolios: Portfolio[];
  onSaveGroup: (oldGroupName: string, newGroupName: string, newCapital?: number) => Promise<void>;
  onDissolveGroup: (groupName: string) => Promise<void>;
}

export function GroupModal({
  isOpen,
  onClose,
  groupName,
  initialCapital = 0,
  memberPortfolios,
  onSaveGroup,
  onDissolveGroup,
}: GroupModalProps) {
  const [name, setName] = useState(groupName);
  const [capital, setCapital] = useState(initialCapital > 0 ? String(initialCapital) : '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDissolve, setConfirmDissolve] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(groupName);
      setCapital(initialCapital > 0 ? String(initialCapital) : '');
      setError('');
      setConfirmDissolve(false);
    }
  }, [isOpen, groupName, initialCapital]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (!name.trim()) {
      setError('請輸入群組名稱');
      return;
    }
    const numCapital = capital.trim() ? parseFloat(capital.replace(/,/g, '')) : undefined;
    if (numCapital !== undefined && (!Number.isFinite(numCapital) || numCapital < 0)) {
      setError('請輸入有效的初始持有金額');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      await onSaveGroup(groupName, name.trim(), numCapital);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗，請重試');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDissolve = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError('');
    try {
      await onDissolveGroup(groupName);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '解散失敗，請重試');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4"
      onMouseDown={(e) => {
        if (!isSaving && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        className="apple-glass rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-white/10"
      >
        <div className="flex justify-between items-center p-6 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/10 text-sky-400">
              <FolderOpen size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white apple-title">管理組合群組</h2>
              <p className="text-xs text-[#8E8E93]">設定共同初始本金與成員組合</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            aria-label="關閉"
            className="p-1.5 rounded-full text-[#8E8E93] hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <p role="alert" className="text-xs text-rose-300 p-3 bg-rose-950/40 rounded-2xl border border-rose-900/60 leading-relaxed">
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#8E8E93]">群組名稱</label>
            <input
              type="text"
              value={name}
              disabled={isSaving}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: 核心長線資產群組"
              className="input-field"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#8E8E93] flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-white/90">
                <Coins size={14} className="text-amber-400" /> 共同初始持有金額 (本金池)
              </span>
              <span className="text-[11px] text-[#8E8E93]">選填</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8E93] text-sm font-mono">$</span>
              <input
                type="number"
                min="0"
                step="1000"
                value={capital}
                disabled={isSaving}
                onChange={(e) => setCapital(e.target.value)}
                placeholder="例如: 1000000 (一百萬)"
                className="input-field pl-7 font-mono"
              />
            </div>
            <p className="text-[11px] text-[#8E8E93] leading-relaxed">
              此金額為該群組所有組合共同分配的初始總資產，系統將據此精算現金餘額與整體資金報酬率。
            </p>
          </div>

          {/* Member Portfolios List */}
          <div className="pt-2">
            <p className="text-xs font-medium text-[#8E8E93] mb-2 flex items-center gap-1.5">
              <span>所屬組合成員 ({memberPortfolios.length})</span>
            </p>
            <div className="bg-[#171720] rounded-2xl p-3 border border-white/[0.12] space-y-1.5 max-h-36 overflow-y-auto shadow-inner">
              {memberPortfolios.map((p) => (
                <div key={p.id} className="flex justify-between items-center text-xs py-1 px-1.5 rounded-lg hover:bg-white/[0.06]">
                  <span className="text-white font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                    {p.name}
                  </span>
                  <span className="text-[#8E8E93] font-mono">{p.positions.length} 檔持倉</span>
                </div>
              ))}
              {memberPortfolios.length === 0 && (
                <p className="text-xs text-[#8E8E93]">目前尚無組合加入此群組</p>
              )}
            </div>
          </div>

          <div className="pt-3 flex gap-2.5">
            <button
              type="submit"
              disabled={isSaving}
              className="action-btn flex-1 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {isSaving ? '儲存中…' : '確認儲存群組設定'}
            </button>
          </div>

          {/* Dissolve Group Option */}
          <div className="pt-3 border-t border-white/[0.08]">
            {!confirmDissolve ? (
              <button
                type="button"
                onClick={() => setConfirmDissolve(true)}
                className="text-xs text-[#8E8E93] hover:text-rose-400 transition-colors flex items-center gap-1.5 mx-auto"
              >
                <Trash2 size={13} /> 解散此群組 (組合將轉為獨立無群組)
              </button>
            ) : (
              <div className="p-3 rounded-2xl bg-rose-950/30 border border-rose-900/50 space-y-2 text-center">
                <p className="text-xs text-rose-200">確定解散？群組中所有組合將轉為獨立組合，持倉資料均保留。</p>
                <div className="flex gap-2 justify-center">
                  <button
                    type="button"
                    onClick={() => setConfirmDissolve(false)}
                    className="px-3 py-1 rounded-full text-xs text-[#8E8E93] hover:text-white bg-white/5"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleDissolve}
                    disabled={isSaving}
                    className="px-3 py-1 rounded-full text-xs text-rose-300 hover:text-white bg-rose-600/30 border border-rose-500/40"
                  >
                    確認解散
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  );
}
