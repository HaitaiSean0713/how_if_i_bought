import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Portfolio } from '../types';
import { taiwanDate, validHistoricalDate } from '../lib/historical';
import { actionLabels, holdingsVersion, MAX_IMPORT_BYTES, parseDelimited, parseImportTable, parseImportText, planHoldingImport, type ImportAction, type ImportRow } from '../lib/holdingImport';

interface Props {
  portfolio: Portfolio;
  onClose: () => void;
  onConfirm: (rows: ImportRow[], version: string, batchId: string) => Promise<void>;
}
const sample = '股票代號,股數,價格,日期,操作\n2330,1000,600,2024-06-03,設定\n0050,2000,150,2024-06-03,買進';
type Sheet = { sheet: string; data: unknown[][] };

export function ImportHoldingsModal({ portfolio, onClose, onConfirm }: Props) {
  const [text, setText] = useState('');
  const [defaultDate, setDefaultDate] = useState(taiwanDate(new Date()));
  const [defaultAction, setDefaultAction] = useState<ImportAction>('set');
  const [encoding, setEncoding] = useState('utf-8');
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [fileName, setFileName] = useState('');
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
    lock.current = true; setBusy('讀取檔案中…'); invalidate(); setSheets([]); setText(''); setFileName('');
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('檔案上限為 2 MB，請拆成較小的檔案。');
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension === 'xlsx') {
        const { default: readExcelFile } = await import('read-excel-file/universal');
        const result = await readExcelFile(file);
        setSheets(result); setSheetIndex(0);
      } else if (['txt', 'csv', 'tsv', 'md'].includes(extension || '')) {
        const contents = new TextDecoder(encoding, { fatal: true }).decode(await file.arrayBuffer());
        if (!contents.trim()) throw new Error('檔案沒有文字內容。');
        setText(contents);
      } else throw new Error('請使用 .txt、.csv、.tsv、.md 或 .xlsx。舊版 .xls 請先另存成 .xlsx。');
      setFileName(file.name);
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
    catch (e) { setError((e as Error).message); setPreview(null); }
    finally { lock.current = false; setBusy(''); }
  }

  return <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center">
    <section role="dialog" aria-modal="true" aria-labelledby="import-title" className="card-bg rounded-lg w-full max-w-5xl max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-5">
      <div className="flex justify-between items-start gap-4">
        <div><h2 id="import-title" className="text-xl gold-text">匯入文字／表格</h2><p className="text-sm mt-2">目標組合：{portfolio.name}</p></div>
        <button disabled={!!busy} onClick={onClose} aria-label="關閉匯入" className="p-2 disabled:opacity-40"><X /></button>
      </div>
      <p className="text-sm text-[#9CA3AF]">貼上文字、複製試算表儲存格，或上傳 TXT、CSV、TSV、Excel（.xlsx）。每次最多 300 筆、2 MB。內容在裝置上解析，確認後才儲存到目前組合。</p>
      <fieldset disabled={!!busy} className="space-y-4 disabled:opacity-60">
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-sm">未標示操作時<select className="input-field mt-1" value={defaultAction} onChange={e => { setDefaultAction(e.target.value as ImportAction); invalidate(); }}><option value="set">設定總持股</option><option value="buy">買進（增加股數）</option><option value="sell">賣出（減少股數）</option></select></label>
          <label className="text-sm">未標示日期時<input type="date" className="input-field mt-1 [color-scheme:dark]" value={defaultDate} max={taiwanDate(new Date())} onChange={e => { setDefaultDate(e.target.value); invalidate(); }} /></label>
          <label className="text-sm">文字檔編碼<select className="input-field mt-1" value={encoding} onChange={e => setEncoding(e.target.value)}><option value="utf-8">UTF-8</option><option value="big5">Big5（部分券商匯出）</option></select></label>
        </div>
        <label className="block text-sm">選取檔案<input aria-label="匯入檔案" type="file" accept=".txt,.csv,.tsv,.md,.xlsx" className="block mt-2 w-full" onChange={e => { void readFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {fileName && <p className="text-sm text-[#9CA3AF]">已選取：{fileName}</p>}
        {sheets.length > 0 ? <label className="block text-sm">工作表<select className="input-field mt-1" value={sheetIndex} onChange={e => { setSheetIndex(Number(e.target.value)); invalidate(); }}>{sheets.map((sheet, index) => <option key={index} value={index}>{sheet.sheet}</option>)}</select><button className="underline mt-2" onClick={() => { setSheets([]); setFileName(''); invalidate(); }}>改為貼上文字</button></label>
          : <label className="block text-sm">文字或表格內容<textarea aria-label="文字或表格內容" rows={6} className="input-field mt-2 font-mono text-sm" value={text} onChange={e => { setText(e.target.value); setFileName(''); invalidate(); }} placeholder={'2024/06/03 買進 2330 1000 股，每股 600 元\n把 0050 調整為 2000 股，均價 150 元\n賣出 2330 500 股，每股 700 元'} /></label>}
        <div className="flex flex-wrap gap-3 items-center"><button className="action-btn" onClick={parse}>解析內容</button><button className="underline text-sm" onClick={() => { setText(sample); setSheets([]); setFileName(''); invalidate(); }}>填入表格範例</button></div>
        <details className="text-sm text-[#9CA3AF]"><summary className="cursor-pointer">格式與操作說明</summary><div className="space-y-2 mt-2">
          <p>表格可包含「股票代號、股數、價格、日期、操作」欄位，順序不限。沒有標題時，請依此順序排列；張數欄或文字中的 1 張會轉成 1000 股。股票代號如 0050，請在 Excel 中設為文字以保留前面的 0。</p>
          <p>文字請每行一筆，寫出股票代號、操作、股數、每股價格；也可用分號分隔。不支援圖片、PDF 或任意語意推論；無法辨識時，請在下方校對欄位。</p>
          <p>「設定總持股」會以新的股數、均價與日期取代該股票全部現有批次；未列出的股票不受影響。「買進」增加一筆持倉。「賣出」依買進日期由早到晚扣除並建立平倉紀錄。「刪除持股」只移除現有批次，不計算損益。既有平倉紀錄均保留。</p>
        </div></details>
        {rows.length > 0 && <div className="space-y-3">
          <h3 className="gold-text">校對資料（{rows.length} 筆）</h3>
          <p className="text-sm text-[#9CA3AF]">所有欄位都可修改。價格是每股價格；設定總持股時請填成本均價。重複匯入「買進／賣出」會再次增加或減少持股。</p>
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[740px]"><thead><tr>{['操作', '股票代號', '股數', '每股價格', '日期', ''].map((label, i) => <th key={i} className="text-left p-1">{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <React.Fragment key={row.id}><tr>
            <td className="p-1"><select aria-label={`第 ${index + 1} 筆操作`} className="input-field" value={row.action} onChange={e => edit(index, 'action', e.target.value)}>{!Object.hasOwn(actionLabels, row.action) && <option value={row.action}>請選擇操作</option>}{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
            {(['symbol', 'shares', 'price', 'date'] as const).map(field => <td key={field} className="p-1"><input aria-label={`第 ${index + 1} 筆${field === 'symbol' ? '股票代號' : field === 'shares' ? '股數' : field === 'price' ? '每股價格' : '日期'}`} className="input-field min-w-24" value={row[field]} disabled={row.action === 'delete' && field !== 'symbol'} type={field === 'date' ? 'date' : 'text'} onChange={e => edit(index, field, e.target.value)} /></td>)}
            <td><button aria-label={`移除第 ${index + 1} 筆匯入資料`} onClick={() => { setRows(rows.filter((_, i) => i !== index)); setPreview(null); }} className="p-2"><X size={16} /></button></td>
          </tr><tr><td colSpan={6} className="px-2 pb-3 text-xs text-[#9CA3AF] break-all">來源：{row.source}</td></tr></React.Fragment>)}</tbody></table></div>
          <div className="flex flex-wrap gap-3"><button className="px-3 py-2 border rounded" onClick={() => void fillPrices()}>補齊缺少價格</button><button className="action-btn" onClick={showPreview}>預覽持倉變更</button></div>
        </div>}
      </fieldset>
      {error && <p role="alert" className="p-3 border border-red-900 bg-red-900/20 text-red-300 rounded">{error}</p>}
      {notice && <p className="text-sm text-amber-200">{notice}</p>}
      {preview && <div className="border border-[#C5A059] rounded p-4 space-y-3">
        <h3 className="gold-text">即將套用至「{portfolio.name}」</h3>
        <div className="space-y-2">{preview.changes.map((change, index) => <p key={index} className="text-sm">{index + 1}. {actionLabels[change.row.action as ImportAction]} {change.symbol}：{money(change.before)} → <strong>{money(change.after)} 股</strong>；持倉成本 ${money(change.costBefore)} → ${money(change.costAfter)}</p>)}</div>
        <p className="text-sm text-amber-200">確認後一次儲存全部變更。設定或刪除會移除該股票原有持倉批次，請核對股數與成本。</p>
        <button disabled={!!busy || holdingsVersion(portfolio) !== version} className="action-btn disabled:opacity-40" onClick={() => void confirm()}>確認套用 {rows.length} 筆變更</button>
        {holdingsVersion(portfolio) !== version && <p role="alert" className="text-amber-200">持倉已變更，請重新產生預覽。</p>}
      </div>}
      {busy && <p role="status" className="gold-text">{busy}</p>}
      {busy && lookupAbort.current && <button className="border rounded px-3 py-2" onClick={() => lookupAbort.current?.abort()}>停止查詢</button>}
    </section>
  </div>;
}
