import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Sparkles, Image as ImageIcon, FileSpreadsheet, ArrowRight } from 'lucide-react';
import type { Portfolio } from '../types';
import { taiwanDate, validHistoricalDate } from '../lib/historical';
import { actionLabels, holdingsVersion, MAX_IMPORT_BYTES, parseDelimited, parseImportTable, parseImportText, planHoldingImport, type ImportAction, type ImportRow } from '../lib/holdingImport';
import { resolveStockSymbol } from '../lib/taiwanStocks';

interface Props {
  portfolio: Portfolio;
  onClose: () => void;
  onConfirm: (rows: ImportRow[], version: string, batchId: string) => Promise<void>;
}
const sample = '2330 1000 600\n0050 買進 2 張 150 元\n2024-06-03 買進 台積電 1000 股 600 元\n賣出 2330 500 股 700 元';
type Sheet = { sheet: string; data: unknown[][] };

export function ImportHoldingsModal({ portfolio, onClose, onConfirm }: Props) {
  const [text, setText] = useState('');
  const [defaultDate, setDefaultDate] = useState(taiwanDate(new Date()));
  const [defaultAction, setDefaultAction] = useState<ImportAction>('set');
  const [encoding, setEncoding] = useState('utf-8');
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [fileName, setFileName] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [preview, setPreview] = useState<ReturnType<typeof planHoldingImport> | null>(null);
  const [version, setVersion] = useState('');
  const [batchId, setBatchId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const lookupAbort = useRef<AbortController | null>(null);
  const invalidate = () => { setRows([]); setPreview(null); setError(''); setNotice(''); };
  const money = (value: number) => value.toLocaleString('zh-TW', { maximumFractionDigits: 2 });

  async function readFile(file?: File) {
    if (!file || lock.current) return;
    lock.current = true; setBusy('讀取檔案中…'); invalidate(); setSheets([]); setText(''); setFileName(''); setImagePreview(null);
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('檔案上限為 2 MB，請拆成較小的檔案。');
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (['png', 'jpg', 'jpeg', 'webp'].includes(extension || '')) {
        const reader = new FileReader();
        reader.onload = () => {
          setImagePreview(reader.result as string);
          setFileName(file.name);
        };
        reader.readAsDataURL(file);
      } else if (extension === 'xlsx') {
        const { default: readExcelFile } = await import('read-excel-file/universal');
        const result = await readExcelFile(file);
        setSheets(result); setSheetIndex(0);
        setFileName(file.name);
      } else if (['txt', 'csv', 'tsv', 'md'].includes(extension || '')) {
        const contents = new TextDecoder(encoding, { fatal: true }).decode(await file.arrayBuffer());
        if (!contents.trim()) throw new Error('檔案沒有文字內容。');
        setText(contents);
        setFileName(file.name);
      } else throw new Error('請使用 .txt、.csv、.tsv、.md、.xlsx 或券商截圖圖片 (.png/.jpg)。');
    } catch (e) {
      setError(e instanceof TypeError ? '文字編碼無法辨識，請切換 UTF-8／Big5 後重新選取檔案。' : e instanceof Error ? e.message : '檔案讀取失敗');
    } finally { lock.current = false; setBusy(''); }
  }

  function parse() {
    setError(''); setNotice(''); setPreview(null);
    try {
      if (!validHistoricalDate(defaultDate)) throw new Error('請選擇有效的預設日期。');
      const result = sheets.length ? parseImportTable(sheets[sheetIndex].data, defaultAction, defaultDate)
        : fileName.toLowerCase().endsWith('.csv') ? parseImportTable(parseDelimited(text, ','), defaultAction, defaultDate)
        : parseImportText(text, defaultAction, defaultDate, portfolio);
      if (!result.length) throw new Error('沒有可匯入的資料列。');
      setRows(result);
    } catch (e) { setError((e as Error).message); setRows([]); }
  }

  async function parseWithAI() {
    if (lock.current) return;
    lock.current = true; setBusy('AI 智能分析與對帳單辨識中…'); setError(''); setNotice(''); setPreview(null);
    try {
      if (!text.trim() && !imagePreview) {
        throw new Error('請先貼上文字、輸入內容或選擇券商對帳單截圖。');
      }

      const res = await fetch('/api/ai/parse-holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          imageBase64: imagePreview,
          defaultDate,
          defaultAction
        })
      });

      const data = await res.json();
      if (!res.ok || !Array.isArray(data.rows)) {
        throw new Error(data.error || 'AI 端點無法回應');
      }

      const formattedRows: ImportRow[] = data.rows.map((r: any, idx: number) => {
        const resolved = resolveStockSymbol(r.symbol || '');
        return {
          id: `ai-row-${idx}`,
          source: r.source || r.symbol || `AI 辨識第 ${idx + 1} 筆`,
          action: r.action || defaultAction,
          symbol: resolved ? resolved.symbol.replace(/\.TW(O)?$/, '') : String(r.symbol || '').toUpperCase(),
          shares: String(r.shares || ''),
          price: String(r.price || ''),
          date: r.date || defaultDate
        };
      });

      if (!formattedRows.length) throw new Error('AI 未能從內容中識別出持倉資料。');
      setRows(formattedRows);
      setNotice('AI 已完成深度辨識，請校對下方欄位。');
    } catch (e: any) {
      console.warn('AI Parsing failed, falling back to local engine:', e.message);
      setNotice('使用本地高容錯規則引擎進行辨識。');
      parse();
    } finally {
      lock.current = false;
      setBusy('');
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = () => {
            setImagePreview(reader.result as string);
            setFileName('已貼上剪貼簿截圖');
          };
          reader.readAsDataURL(blob);
          e.preventDefault();
          break;
        }
      }
    }
  }

  function edit(index: number, field: keyof ImportRow, value: string) {
    setRows(current => current.map((row, i) => i === index ? { ...row, [field]: value } : row));
    setPreview(null); setError(''); setNotice('');
  }

  async function fillPrices() {
    if (lock.current) return;
    lock.current = true; setBusy('查詢缺少的歷史價格…'); setError(''); setNotice(''); setPreview(null);
    const controller = new AbortController(); lookupAbort.current = controller;
    const updated = rows.map(row => ({ ...row })); const failures: number[] = [];
    try {
      for (const [index, row] of updated.entries()) {
        if (controller.signal.aborted) break;
        if (row.action === 'delete' || row.price.trim()) continue;
        if (!row.symbol.trim() || !validHistoricalDate(row.date)) { failures.push(index + 1); continue; }
        setBusy(`查詢第 ${index + 1} / ${updated.length} 筆…`);
        try {
          const response = await fetch(`/api/historical/${encodeURIComponent(row.symbol.trim())}/${encodeURIComponent(row.date)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
          const data = await response.json();
          if (!response.ok || !Number.isFinite(data.close) || data.close <= 0) throw new Error();
          row.price = String(data.close); row.symbol = data.actualSymbol || row.symbol;
        } catch { failures.push(index + 1); }
      }
      setRows(updated);
      setNotice((controller.signal.aborted ? '已停止查詢，已取得的價格已保留。' : '') + '補齊價格使用該日期或之前最近交易日的收盤價，請確認符合你的交易成本。');
      if (failures.length) setError(`第 ${failures.join('、')} 筆未取得價格，請手動填寫。`);
    } finally { lookupAbort.current = null; lock.current = false; setBusy(''); }
  }

  function showPreview() {
    setError(''); setNotice('');
    try {
      const id = crypto.randomUUID();
      setPreview(planHoldingImport(portfolio, rows, id));
      setVersion(holdingsVersion(portfolio)); setBatchId(id);
    } catch (e) { setPreview(null); setError((e as Error).message); }
  }

  async function confirm() {
    if (lock.current || !preview) return;
    lock.current = true; setBusy('儲存持倉中…'); setError('');
    try { await onConfirm(rows, version, batchId); onClose(); }
    catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(''); }
  }

  return <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md p-3 sm:p-6 flex items-center justify-center">
    <motion.section 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="import-title" 
      initial={{ opacity: 0, scale: 0.96, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
      className="apple-glass rounded-3xl border border-white/10 shadow-2xl w-full max-w-5xl max-h-[92dvh] overflow-y-auto p-5 sm:p-7 space-y-6"
    >
      <div className="flex justify-between items-start gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-white/10 text-white">
              <FileSpreadsheet size={20} />
            </span>
            <h2 id="import-title" className="text-lg sm:text-xl font-bold tracking-tight text-white apple-title">匯入持倉文字／表格／截圖</h2>
          </div>
          <p className="text-xs text-[#8E8E93] mt-1.5 ml-10">目標組合：<span className="text-white font-medium">{portfolio.name}</span></p>
        </div>
        <button disabled={!!busy} onClick={onClose} aria-label="關閉匯入" className="p-1.5 rounded-full text-[#8E8E93] hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40">
          <X size={18} />
        </button>
      </div>

      <p className="text-sm text-[#9CA3AF] bg-white/[0.02] border border-[#222226] p-3 rounded-xl">
        貼上文字、複製試算表儲存格、選擇檔案（TXT, CSV, Excel），或直接貼上/上傳券商庫存對帳單截圖。每次最多 300 筆、2 MB。
      </p>

      <fieldset disabled={!!busy} className="space-y-4 disabled:opacity-60">
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-xs text-[#9CA3AF] font-medium">未標示操作時
            <select className="input-field mt-1.5" value={defaultAction} onChange={e => { setDefaultAction(e.target.value as ImportAction); invalidate(); }}>
              <option value="set">設定總持股</option>
              <option value="buy">買進（增加股數）</option>
              <option value="sell">賣出（減少股數）</option>
            </select>
          </label>
          <label className="text-xs text-[#9CA3AF] font-medium">未標示日期時
            <input type="date" className="input-field mt-1.5 [color-scheme:dark]" value={defaultDate} max={taiwanDate(new Date())} onChange={e => { setDefaultDate(e.target.value); invalidate(); }} />
          </label>
          <label className="text-xs text-[#9CA3AF] font-medium">文字檔編碼
            <select className="input-field mt-1.5" value={encoding} onChange={e => setEncoding(e.target.value)}>
              <option value="utf-8">UTF-8</option>
              <option value="big5">Big5（部分券商匯出）</option>
            </select>
          </label>
        </div>

        <label className="block text-xs text-[#9CA3AF] font-medium">選取檔案或截圖圖片
          <input aria-label="匯入檔案" type="file" accept=".txt,.csv,.tsv,.md,.xlsx,.png,.jpg,.jpeg,.webp" className="block mt-2 w-full text-sm text-[#9CA3AF] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#C5A059]/10 file:text-[#C5A059] hover:file:bg-[#C5A059]/20 cursor-pointer" onChange={e => { void readFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {fileName && <p className="text-sm text-[#9CA3AF]">已選取檔案：<span className="text-white">{fileName}</span></p>}
        {imagePreview && (
          <div className="relative border border-[#C5A059]/40 bg-[#C5A059]/5 rounded-xl p-3 max-w-sm">
            <p className="text-xs gold-text mb-2 flex items-center gap-1.5 font-medium">
              <ImageIcon size={15} /> 截圖已加載，準備辨識：
            </p>
            <img src={imagePreview} alt="對帳單截圖" className="max-h-40 rounded-lg object-contain border border-[#222226]" />
            <button className="mt-2 text-xs text-rose-400 hover:text-rose-300 transition-colors underline" onClick={() => { setImagePreview(null); setFileName(''); invalidate(); }}>
              清除圖片
            </button>
          </div>
        )}

        {sheets.length > 0 ? (
          <label className="block text-xs text-[#9CA3AF] font-medium">工作表
            <select className="input-field mt-1.5" value={sheetIndex} onChange={e => { setSheetIndex(Number(e.target.value)); invalidate(); }}>
              {sheets.map((sheet, index) => <option key={index} value={index}>{sheet.sheet}</option>)}
            </select>
            <button className="underline mt-2 text-xs text-[#C5A059]" onClick={() => { setSheets([]); setFileName(''); invalidate(); }}>改為貼上文字</button>
          </label>
        ) : (
          <label className="block text-xs text-[#9CA3AF] font-medium">文字或表格內容 (可按 Ctrl+V 直接貼上截圖圖片)
            <textarea 
              aria-label="文字或表格內容" 
              rows={6} 
              className="input-field mt-1.5 font-mono text-sm leading-relaxed" 
              value={text} 
              onPaste={handlePaste} 
              onChange={e => { setText(e.target.value); setFileName(''); invalidate(); }} 
              placeholder={'支援多種格式：\n- 代號 股數 價格: 2330 1000 600\n- 中文股票名稱: 2024-06-03 買進 台積電 1000股 600元\n- 券商對帳單: 1130603 現股買進 2330 1,000 600.00\n- 或直接按 Ctrl+V 貼上券商庫存截圖圖片'} 
            />
          </label>
        )}

        <div className="flex flex-wrap gap-3 items-center pt-1">
          <button className="action-btn" onClick={parse}>解析內容 (本地高容錯引擎)</button>
          <button className="action-btn bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 flex items-center gap-1.5 shadow-lg shadow-amber-900/20" onClick={() => void parseWithAI()}>
            <Sparkles size={16} /> AI 智能 / 截圖辨識
          </button>
          <button className="text-xs text-[#9CA3AF] hover:text-[#E5E7EB] transition-colors underline" onClick={() => { setText(sample); setSheets([]); setFileName(''); setImagePreview(null); invalidate(); }}>
            填入測試範例
          </button>
        </div>

        <details className="text-xs text-[#9CA3AF] bg-white/[0.01] border border-[#222226] p-3 rounded-xl">
          <summary className="cursor-pointer font-medium text-[#C5A059] select-none">格式與智慧辨識說明</summary>
          <div className="space-y-1.5 mt-2.5 leading-relaxed">
            <p>• 支援中文股票名稱（如台積電、鴻海、0050、元大台灣50、環球晶等），自動匹配為標準股票代號。</p>
            <p>• 支援精簡格式（`2330 1000 600`）、各種券商交易別（現股買進、資買、零買、定期定額、現股賣出等）、民國與西元日期。</p>
            <p>• 支援貼上或上傳券商手機 App 對帳單/庫存截圖，點擊「AI 智能 / 截圖辨識」自動提取股票、股數與價格。</p>
          </div>
        </details>

        {rows.length > 0 && <div className="space-y-3 pt-2">
          <div className="flex justify-between items-center">
            <h3 className="gold-text font-medium text-base">校對資料（{rows.length} 筆）</h3>
            <span className="text-xs text-[#9CA3AF]">所有欄位均可直接修改</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[#222226] bg-black/40">
            <table className="w-full text-sm min-w-[740px]">
              <thead className="bg-white/[0.02] border-b border-[#222226]">
                <tr>{['操作', '股票代號/名稱', '股數', '每股價格', '日期', ''].map((label, i) => <th key={i} className="text-left px-3 py-2.5 text-xs text-[#9CA3AF] font-medium">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[#222226]">{rows.map((row, index) => {
                const res = resolveStockSymbol(row.symbol);
                const displayName = res?.shortName ? `${row.symbol} (${res.shortName})` : row.symbol;
                return <React.Fragment key={row.id}>
                  <tr>
                    <td className="p-2"><select aria-label={`第 ${index + 1} 筆操作`} className="input-field text-xs" value={row.action} onChange={e => edit(index, 'action', e.target.value)}>{!Object.hasOwn(actionLabels, row.action) && <option value={row.action}>請選擇操作</option>}{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                    <td className="p-2"><input aria-label={`第 ${index + 1} 筆股票代號`} className="input-field text-xs min-w-28 font-mono" value={row.symbol} title={displayName} onChange={e => edit(index, 'symbol', e.target.value)} /></td>
                    <td className="p-2"><input aria-label={`第 ${index + 1} 筆股數`} className="input-field text-xs min-w-24 font-mono" value={row.shares} onChange={e => edit(index, 'shares', e.target.value)} /></td>
                    <td className="p-2"><input aria-label={`第 ${index + 1} 筆每股價格`} className="input-field text-xs min-w-24 font-mono" value={row.price} disabled={row.action === 'delete'} onChange={e => edit(index, 'price', e.target.value)} /></td>
                    <td className="p-2"><input aria-label={`第 ${index + 1} 筆日期`} className="input-field text-xs min-w-28 [color-scheme:dark]" value={row.date} type="date" onChange={e => edit(index, 'date', e.target.value)} /></td>
                    <td className="p-2 text-right"><button aria-label={`移除第 ${index + 1} 筆匯入資料`} onClick={() => { setRows(rows.filter((_, i) => i !== index)); setPreview(null); }} className="p-1.5 rounded-lg text-[#6B7280] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"><X size={16} /></button></td>
                  </tr>
                  <tr><td colSpan={6} className="px-3 pb-2.5 text-xs text-[#6B7280] break-all">來源：{row.source} {res?.shortName && <span className="gold-text">({res.shortName})</span>}</td></tr>
                </React.Fragment>;
              })}</tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <button className="px-4 py-2 border border-[#333] hover:border-[#555] rounded-xl text-xs text-[#E5E7EB] hover:bg-white/5 transition-colors" onClick={() => void fillPrices()}>補齊缺少價格</button>
            <button className="action-btn text-xs" onClick={showPreview}>預覽持倉變更</button>
          </div>
        </div>}
      </fieldset>

      {error && <p role="alert" className="p-3.5 border border-red-900 bg-red-900/20 text-red-300 rounded-xl text-sm">{error}</p>}
      {notice && <p className="text-sm text-amber-200 bg-amber-900/20 border border-amber-900/40 p-3 rounded-xl">{notice}</p>}
      
      {preview && (
        <div className="border border-[#C5A059]/40 bg-[#C5A059]/5 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-[#C5A059]" />
            <h3 className="gold-text font-medium">即將套用至「{portfolio.name}」</h3>
          </div>
          <div className="space-y-2 bg-black/40 p-3.5 rounded-xl border border-[#222226]">
            {preview.changes.map((change, index) => (
              <p key={index} className="text-xs sm:text-sm text-[#E5E7EB] flex items-center gap-1.5 flex-wrap">
                <span className="text-[#9CA3AF]">{index + 1}.</span> 
                <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-xs font-mono">{actionLabels[change.row.action as ImportAction]}</span> 
                <span className="font-semibold text-white">{change.symbol}</span>：
                <span className="font-mono text-[#9CA3AF]">{money(change.before)}</span> 
                <ArrowRight size={13} className="text-[#C5A059]" /> 
                <strong className="font-mono text-emerald-400">{money(change.after)} 股</strong>；
                <span className="text-[#9CA3AF]">持倉成本</span> 
                <span className="font-mono text-[#9CA3AF]">${money(change.costBefore)}</span> 
                <ArrowRight size={13} className="text-[#C5A059]" /> 
                <span className="font-mono text-white">${money(change.costAfter)}</span>
              </p>
            ))}
          </div>
          <p className="text-xs text-amber-200/90 leading-relaxed">確認後一次儲存全部變更。設定或刪除會移除該股票原有持倉批次，請核對股數與成本。</p>
          <button disabled={!!busy || holdingsVersion(portfolio) !== version} className="action-btn w-full sm:w-auto disabled:opacity-40" onClick={() => void confirm()}>
            確認套用 {rows.length} 筆變更
          </button>
          {holdingsVersion(portfolio) !== version && <p role="alert" className="text-amber-200 text-xs">持倉已變更，請重新產生預覽。</p>}
        </div>
      )}

      {busy && <p role="status" className="gold-text text-sm flex items-center gap-2 animate-pulse"><span className="w-2 h-2 rounded-full bg-[#C5A059] inline-block" />{busy}</p>}
      {busy && lookupAbort.current && <button className="border border-[#333] hover:border-[#555] rounded-xl px-3 py-1.5 text-xs text-[#E5E7EB]" onClick={() => lookupAbort.current?.abort()}>停止查詢</button>}
    </motion.section>
  </div>;
}
