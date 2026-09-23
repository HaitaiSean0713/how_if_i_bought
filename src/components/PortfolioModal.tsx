import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Briefcase, FolderPlus, Coins } from 'lucide-react';

interface PortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string, groupName?: string, groupInitialCapital?: number) => Promise<void>;
  initialName?: string;
  initialGroupName?: string;
  initialGroupCapital?: number;
  existingGroups?: { name: string; initialCapital?: number }[];
}

export function PortfolioModal({
  isOpen,
  onClose,
  onConfirm,
  initialName = '',
  initialGroupName = '',
  initialGroupCapital = 0,
  existingGroups = [],
}: PortfolioModalProps) {
  const [name, setName] = useState(initialName);
  const [selectedGroup, setSelectedGroup] = useState<string>(initialGroupName || '__none__');
  const [customGroupName, setCustomGroupName] = useState('');
  const [groupCapital, setGroupCapital] = useState<string>(
    initialGroupCapital > 0 ? String(initialGroupCapital) : ''
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setSelectedGroup(initialGroupName || '__none__');
      setCustomGroupName('');
      setGroupCapital(initialGroupCapital > 0 ? String(initialGroupCapital) : '');
      setError('');
    }
  }, [isOpen, initialName, initialGroupName, initialGroupCapital]);

  // When user selects an existing group, auto-fill its capital if already set
  const handleGroupSelectChange = (val: string) => {
    setSelectedGroup(val);
    if (val !== '__none__' && val !== '__new__') {
      const found = existingGroups.find((g) => g.name === val);
      if (found && typeof found.initialCapital === 'number' && found.initialCapital > 0) {
        setGroupCapital(String(found.initialCapital));
      }
    }
  };

  if (!isOpen) return null;

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
            <div className="p-2 rounded-xl bg-white/10 text-white">
              <Briefcase size={18} />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-white apple-title">
              {initialName ? '重新命名組合' : '新增投資組合'}
            </h2>
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
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (isSaving) return;
            if (!name.trim()) {
              setError('請輸入組合名稱');
              return;
            }

            let finalGroupName: string | undefined;
            if (selectedGroup === '__new__') {
              if (!customGroupName.trim()) {
                setError('請輸入新群組名稱');
                return;
              }
              finalGroupName = customGroupName.trim();
            } else if (selectedGroup !== '__none__') {
              finalGroupName = selectedGroup;
            }

            let numCapital: number | undefined;
            if (finalGroupName && groupCapital.trim()) {
              const parsed = parseFloat(groupCapital.replace(/,/g, ''));
              if (Number.isFinite(parsed) && parsed > 0) {
                numCapital = parsed;
              }
            }

            setIsSaving(true);
            setError('');
            try {
              await onConfirm(name.trim(), finalGroupName, numCapital);
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : '儲存失敗，請重試');
            } finally {
              setIsSaving(false);
            }
          }}
          className="p-6 space-y-4"
        >
          {error && (
            <p role="alert" className="text-xs text-rose-300 p-3 bg-rose-950/40 rounded-2xl border border-rose-900/60 leading-relaxed">
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#8E8E93]">組合名稱</label>
            <input
              autoFocus
              type="text"
              value={name}
              disabled={isSaving}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: 科技股存股"
              className="input-field"
              required
            />
          </div>

          {/* Group Classification */}
          <div className="space-y-1.5 pt-1">
            <label className="block text-xs font-medium text-[#8E8E93] flex items-center justify-between">
              <span>所屬群組 (可選)</span>
              <span className="text-[11px] text-[#8E8E93]">將多個組合歸組共享資金</span>
            </label>
            <select
              value={selectedGroup}
              disabled={isSaving}
              onChange={(e) => handleGroupSelectChange(e.target.value)}
              className="input-field cursor-pointer bg-[#1c1c24] text-[#F5F5F7] font-medium"
            >
              <option value="__none__" className="bg-[#1c1c24] text-[#F5F5F7] py-1">
                無群組 (獨立組合)
              </option>
              {existingGroups.map((g) => (
                <option key={g.name} value={g.name} className="bg-[#1c1c24] text-[#F5F5F7] py-1">
                  群組：{g.name} {g.initialCapital ? `(初始本金 $${g.initialCapital.toLocaleString()})` : ''}
                </option>
              ))}
              <option value="__new__" className="bg-[#1c1c24] text-[#38BDF8] font-semibold py-1">
                ＋ 建立新組合群組…
              </option>
            </select>
          </div>

          {/* New Group Input Field */}
          {selectedGroup === '__new__' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-1.5 overflow-hidden"
            >
              <label className="block text-xs font-medium text-white flex items-center gap-1.5">
                <FolderPlus size={14} className="text-sky-400" />
                新群組名稱
              </label>
              <input
                type="text"
                value={customGroupName}
                disabled={isSaving}
                onChange={(e) => setCustomGroupName(e.target.value)}
                placeholder="例如: 核心資產投資群組"
                className="input-field"
                required
              />
            </motion.div>
          )}

          {/* Shared Initial Capital Input Field */}
          {selectedGroup !== '__none__' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-1.5 overflow-hidden pt-1"
            >
              <label className="block text-xs font-medium text-white flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Coins size={14} className="text-amber-400" />
                  群組共同初始持有金額 (總本金)
                </span>
                <span className="text-[11px] text-[#8E8E93]">選填</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8E93] text-sm font-mono">$</span>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={groupCapital}
                  disabled={isSaving}
                  onChange={(e) => setGroupCapital(e.target.value)}
                  placeholder="例如: 1000000"
                  className="input-field pl-7 font-mono"
                />
              </div>
              <p className="text-[11px] text-[#8E8E93] leading-relaxed">
                群組內所有組合將共同動用此起始本金池，自動計算現金餘額與資金利用率。
              </p>
            </motion.div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="action-btn w-full py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {isSaving ? '儲存中…' : '確認'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
