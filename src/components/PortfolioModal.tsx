import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Briefcase } from 'lucide-react';

interface PortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string) => Promise<void>;
  initialName?: string;
}

export function PortfolioModal({ isOpen, onClose, onConfirm, initialName = '' }: PortfolioModalProps) {
  const [name, setName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setError('');
    }
  }, [isOpen, initialName]);

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
        transition={{ type: "spring", stiffness: 350, damping: 25 }}
        className="card-bg rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-[#26262B]"
      >
        <div className="flex justify-between items-center p-6 border-b border-[#222226]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#C5A059]/10 text-[#C5A059]">
              <Briefcase size={20} />
            </div>
            <h2 className="text-xl serif gold-text">{initialName ? '重新命名組合' : '新增投資組合'}</h2>
          </div>
          <button onClick={onClose} disabled={isSaving} aria-label="關閉" className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#E5E7EB] hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </div>
        <form 
          onSubmit={async (e) => {
            e.preventDefault(); 
            if (isSaving) return;
            if (!name.trim()) { setError('請輸入組合名稱'); return; }
            setIsSaving(true);
            setError('');
            try {
              await onConfirm(name.trim());
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : '儲存失敗，請重試');
            } finally {
              setIsSaving(false);
            }
          }} 
          className="p-6 space-y-5"
        >
           {error && <p role="alert" className="text-sm text-red-300 p-3 bg-red-900/20 rounded-xl border border-red-900/50">{error}</p>}
           <div className="space-y-1.5">
             <label className="block label-text">組合名稱</label>
             <input 
               autoFocus 
               type="text" 
               value={name} 
               disabled={isSaving}
               onChange={e => setName(e.target.value)} 
               placeholder="例如: 科技股存股" 
               className="input-field transition-colors focus:border-[#C5A059] outline-none" 
               required 
             />
           </div>
           <div className="pt-2">
             <button type="submit" disabled={isSaving} className="action-btn w-full disabled:opacity-50">{isSaving ? '儲存中…' : '確認'}</button>
           </div>
        </form>
      </motion.div>
    </div>
  );
}
