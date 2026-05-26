import React, { useState } from 'react';
import { X } from 'lucide-react';

interface PortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
  initialName?: string;
}

export function PortfolioModal({ isOpen, onClose, onConfirm, initialName = '' }: PortfolioModalProps) {
  const [name, setName] = useState(initialName);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
      <div className="card-bg rounded-lg shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center p-6 border-b border-[#222226]">
          <h2 className="text-xl serif gold-text">{initialName ? '重新命名組合' : '新增投資組合'}</h2>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#E5E7EB] transition-colors">
            <X size={24} />
          </button>
        </div>
        <form 
          onSubmit={(e) => { 
            e.preventDefault(); 
            if (name.trim()) onConfirm(name.trim()); 
            setName(''); 
            onClose(); 
          }} 
          className="p-6 space-y-5"
        >
           <div className="space-y-1.5">
             <label className="block label-text">組合名稱</label>
             <input 
               autoFocus 
               type="text" 
               value={name} 
               onChange={e => setName(e.target.value)} 
               placeholder="例如: 科技股存股" 
               className="input-field transition-colors focus:border-[#C5A059] outline-none" 
               required 
             />
           </div>
           <div className="pt-2">
             <button type="submit" className="action-btn w-full">確認</button>
           </div>
        </form>
      </div>
    </div>
  );
}
