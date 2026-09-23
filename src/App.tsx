import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Wallet, TrendingUp, TrendingDown, Activity, RefreshCw, LayoutGrid, Trash2, LogOut, LogIn, Edit2, GripVertical } from 'lucide-react';
import { Position, QuoteData, PortfolioSummary, Portfolio } from './types';
import { cn } from './lib/utils';
import { AddPositionModal } from './components/AddPositionModal';
import { PositionCard, formatCurrency, formatPercent } from './components/PositionCard';
import { SellPositionModal } from './components/SellPositionModal';
import { ClosedPositionCard } from './components/ClosedPositionCard';
import { PortfolioModal } from './components/PortfolioModal';
import { ImportHoldingsModal } from './components/ImportHoldingsModal';
import { holdingsVersion, planHoldingImport, type ImportRow } from './lib/holdingImport';
import { auth, db, loginWithGoogle, logout } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, setDoc, updateDoc, writeBatch, runTransaction } from 'firebase/firestore';
import { migrateGuestPortfolios } from './lib/guestMigration';
import { readPortfolioDocument, sortPortfolios, operationError, sellPosition } from './lib/portfolioOperations';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [isLoadingPortfolios, setIsLoadingPortfolios] = useState(true);

  const [isGuest, setIsGuest] = useState<boolean>(() => {
    return localStorage.getItem('is_guest_mode') === 'true';
  });

  const [activePortfolioId, setActivePortfolioId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'active' | 'closed' | 'compare'>('active');
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sellModalData, setSellModalData] = useState<{ position: Position, currentPrice?: number } | null>(null);
  const [isPortfolioModalOpen, setIsPortfolioModalOpen] = useState(false);
  const [operationMessage, setOperationMessage] = useState('');
  const [pendingAction, setPendingAction] = useState('');
  const operationInFlight = useRef(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [selectedRenamePortfolio, setSelectedRenamePortfolio] = useState<Portfolio | null>(null);
  const [portfolioToDelete, setPortfolioToDelete] = useState<{ id: string, name: string } | null>(null);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoginError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error(err);
      let msg = "登入失敗。";
      if (err.code === "auth/operation-not-allowed") {
        msg = "登入失敗：Firebase 專案尚未啟用 Google 登入方式！請登入 Firebase Console -> Authentication -> 登入方式 (Sign-in method) -> 點擊「新增提供者」並啟用「Google」。";
      } else if (err.code === "auth/unauthorized-domain") {
        msg = `登入失敗：目前部署網域（${window.location.hostname}）尚未加入 Firebase 授權網域！請至 Firebase Console -> Authentication -> 設定 -> 授權網域 (Authorized Domains) -> 將「${window.location.hostname}」新增進去。重要提示：若您在 Vercel 上部署，請確保您有設定 VITE_FIREBASE_API_KEY 等環境變數。`;
      } else if (err.code === "auth/popup-closed-by-user") {
        msg = "登入失敗：登入視窗被手動關閉或被瀏覽器封鎖。請重試，並允許彈出式視窗。";
      } else {
        msg = `登入失敗：${err.message || '未知錯誤'} (${err.code || 'unknown'})`;
      }
      setLoginError(msg);
    }
  };

  useEffect(() => {
    if (!auth) {
      setIsLoadingPortfolios(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setIsGuest(false);
        setPortfolios([]);
        localStorage.removeItem('is_guest_mode');
      }
    });
    return () => unsubscribe();
  }, []);

  // Load guest mode portfolios if applicable
  useEffect(() => {
    if (user) return;
    if (!isGuest) {
      setPortfolios([]);
      setIsLoadingPortfolios(false);
      return;
    }

    setIsLoadingPortfolios(true);
    try {
      const cached = localStorage.getItem('portfolios_guest');
      if (cached) {
        const parsed = (JSON.parse(cached) as Partial<Portfolio>[]).map((p, idx) => readPortfolioDocument(p.id || crypto.randomUUID(), { ...p, sortOrder: p.sortOrder ?? idx }));
        parsed.sort((a, b) => {
          const orderA = a.sortOrder !== undefined ? a.sortOrder : (a.createdAt || 0);
          const orderB = b.sortOrder !== undefined ? b.sortOrder : (b.createdAt || 0);
          return orderA - orderB;
        });
        setPortfolios(parsed);
        const savedActiveId = localStorage.getItem('active_portfolio_id_guest');
        if (savedActiveId && parsed.some(p => p.id === savedActiveId)) {
          setActivePortfolioId(savedActiveId);
        } else {
          setActivePortfolioId(parsed[0]?.id || '');
        }
      } else {
        const defaultPort: Portfolio = {
          id: crypto.randomUUID(),
          name: '預設組合',
          positions: [],
          closedPositions: [],
          createdAt: Date.now(),
          sortOrder: 0
        };
        setPortfolios([defaultPort]);
        setActivePortfolioId(defaultPort.id);
        localStorage.setItem('portfolios_guest', JSON.stringify([defaultPort]));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingPortfolios(false);
    }
  }, [user, isGuest]);

  useEffect(() => {
    if (!user || !db) { setCloudReady(false); return; }
    setIsLoadingPortfolios(true);
    setCloudReady(false);
    let cancelled = false;
    let unsubscribe = () => {};
    const subscribe = async () => {
      try {
        await migrateGuestPortfolios(localStorage, user.uid, async portfolio => {
          const ref = doc(db, 'portfolios', portfolio.id);
          await runTransaction(db, async transaction => {
            const existing = await transaction.get(ref);
            if (!existing.exists()) transaction.set(ref, portfolio);
          });
        });
      } catch (error) {
        if (!cancelled) setOperationMessage('訪客資料尚未完成移轉，本地資料已保留。' + operationError(error));
      }
      if (cancelled) return;
      const q = query(collection(db, 'portfolios'), where('userId', '==', user.uid));
      unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, snapshot => {
        if (cancelled) return;
        // The document path is authoritative; legacy data may contain a different id.
        const loaded = sortPortfolios(snapshot.docs.map(item => readPortfolioDocument(item.id, item.data())));
        setPortfolios(loaded);
        setActivePortfolioId(previous => {
          let saved = '';
          try { saved = localStorage.getItem(`active_portfolio_id_${user.uid}`) || ''; } catch {}
          return loaded.some(p => p.id === previous) ? previous : loaded.some(p => p.id === saved) ? saved : loaded[0]?.id || '';
        });
        setIsLoadingPortfolios(false);
        if (!snapshot.metadata.fromCache) setCloudReady(true);
        // Never upload an old backup when the server reports an empty collection.
        // Pending local writes must not replace the last confirmed backup.
        if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
          try { localStorage.setItem(`portfolios_${user.uid}`, JSON.stringify(loaded)); }
          catch { /* Cloud data is saved even if a redundant browser backup cannot be written. */ }
        }
      }, error => {
        if (cancelled) return;
        setIsLoadingPortfolios(false);
        setCloudReady(false);
        setOperationMessage('雲端資料讀取失敗，請重新整理或重新登入。' + operationError(error));
      });
    };
    void subscribe();
    return () => { cancelled = true; unsubscribe(); };
  }, [user]);

  useEffect(() => {
    if (isLoadingPortfolios || (!user && !isGuest)) return;
    if (user && !cloudReady) return;
    if (activePortfolioId && !portfolios.some(p => p.id === activePortfolioId)) return;
    try {
      const key = user ? `active_portfolio_id_${user.uid}` : 'active_portfolio_id_guest';
      if (activePortfolioId) localStorage.setItem(key, activePortfolioId);
      else localStorage.removeItem(key);
    } catch { /* Selection preference does not affect saved holdings. */ }
  }, [activePortfolioId, user, isGuest, isLoadingPortfolios, cloudReady, portfolios]);

  const performMutation = async (label: string, work: () => Promise<void> | void) => {
    if (operationInFlight.current) throw new Error('上一項操作尚未完成，請稍候。');
    if (!isGuest && (!user || !db || !cloudReady)) throw new Error('雲端資料尚未就緒，請稍候或重新整理頁面。');
    if (!isGuest && !navigator.onLine) throw new Error('目前離線，請恢復網路連線後重試。');
    operationInFlight.current = true;
    setPendingAction(label);
    setOperationMessage('');
    const timer = setTimeout(() => setOperationMessage(`${label}仍在等待雲端確認，請保持連線，勿重複送出。`), 8000);
    try {
      await work();
      setOperationMessage('');
    } catch (error) {
      const message = `${label}失敗：${operationError(error)}`;
      setOperationMessage(message);
      throw new Error(message);
    } finally {
      clearTimeout(timer);
      operationInFlight.current = false;
      setPendingAction('');
    }
  };

  const saveGuestPortfolios = (next: Portfolio[]) => {
    localStorage.setItem('portfolios_guest', JSON.stringify(next));
    setPortfolios(next);
    setActivePortfolioId(previous => next.some(p => p.id === previous) ? previous : next[0]?.id || '');
  };

  useEffect(() => {
    fetchQuotes();
  }, [portfolios.flatMap(p => p.positions.map(pos => pos.symbol)).join(',')]);

  const fetchQuotes = async () => {
    const allSymbols = new Set<string>();
    portfolios.forEach(p => p.positions.forEach(pos => allSymbols.add(pos.symbol)));
    
    if (allSymbols.size === 0) return;
    
    setIsRefreshing(true);
    try {
      const symbols = Array.from(allSymbols);
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      });
      
      if (!res.ok) throw new Error('Failed to fetch quotes');
      
      const data: QuoteData[] = await res.json();
      const quoteMap: Record<string, QuoteData> = {};
      
      data.forEach(q => {
         if(q && q.symbol) quoteMap[q.symbol] = q;
      });
      
      setQuotes(prev => ({...prev, ...quoteMap}));
    } catch (error) {
      console.error(error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const updateActivePortfolio = async (updater: (p: Portfolio) => Portfolio) => {
    const current = portfolios.find(p => p.id === activePortfolioId) || portfolios[0];
    if (!current) throw new Error('找不到作用中的投資組合，請先新增或選取組合。');
    await performMutation('儲存持倉', async () => {
      if (isGuest) {
        const updated = { ...updater(current), updatedAt: Date.now() };
        saveGuestPortfolios(portfolios.map(p => p.id === updated.id ? updated : p));
      } else {
        // Read current holdings to avoid overwriting another device's changes.
        const ref = doc(db, 'portfolios', current.id);
        await runTransaction(db, async transaction => {
          const snapshot = await transaction.get(ref);
          if (!snapshot.exists()) throw new Error('此投資組合已被刪除，請重新整理。');
          const latest = readPortfolioDocument(snapshot.id, snapshot.data());
          const updated = updater(latest);
          transaction.update(ref, { positions: updated.positions, closedPositions: updated.closedPositions, updatedAt: Date.now() });
        });
      }
    });
  };

  const activePortfolio = portfolios.find(p => p.id === activePortfolioId) || portfolios[0];
  const positions = activePortfolio?.positions || [];
  const closedPositions = activePortfolio?.closedPositions || [];

  const groupedPositions = useMemo(() => {
    const groups: Record<string, Position & { history: Position[] }> = {};
    for (const pos of positions) {
      if (!groups[pos.symbol]) {
        groups[pos.symbol] = { ...pos, history: [pos] };
      } else {
        const g = groups[pos.symbol];
        g.shares += pos.shares;
        g.totalCost += pos.totalCost;
        g.buyPrice = g.totalCost / g.shares;
        g.history.push(pos);
      }
    }
    return Object.values(groups).sort((a, b) => b.totalCost - a.totalCost);
  }, [positions]);

  const handleAddPosition = async (newPos: Omit<Position, 'id' | 'totalCost'>) => {
    await updateActivePortfolio(p => {
      const positions = [...p.positions];
      const existingIndex = positions.findIndex(
        pos => pos.symbol === newPos.symbol && pos.buyDate === newPos.buyDate
      );

      if (existingIndex !== -1) {
        const existing = positions[existingIndex];
        const newShares = existing.shares + newPos.shares;
        const newTotalCost = existing.totalCost + newPos.buyPrice * newPos.shares;
        
        positions[existingIndex] = {
          ...existing,
          shares: newShares,
          totalCost: newTotalCost,
          buyPrice: newShares > 0 ? newTotalCost / newShares : 0,
        };
      } else {
        const position: Position = {
          ...newPos,
          id: crypto.randomUUID(),
          totalCost: newPos.buyPrice * newPos.shares,
        };
        positions.push(position);
      }

      return {
        ...p,
        positions,
      };
    });
    setActiveTab('active');
  };

  const handleRemovePosition = (id: string) => {
    void updateActivePortfolio(p => ({ ...p, positions: p.positions.filter(pos => pos.id !== id) })).catch(error => setOperationMessage(operationError(error)));
  };

  const handleImportHoldings = async (rows: ImportRow[], expectedVersion: string, batchId: string) => {
    await updateActivePortfolio(current => {
      if (expectedVersion && holdingsVersion(current) !== expectedVersion) {
        throw new Error('持倉已在其他視窗或裝置變更，請重新產生預覽。');
      }
      return planHoldingImport(current, rows, batchId).portfolio;
    });
    setActiveTab('active');
    setIsImportOpen(false);
  };

  const handleRemoveClosedPosition = (id: string) => {
    void updateActivePortfolio(p => ({ ...p, closedPositions: p.closedPositions.filter(pos => pos.id !== id) })).catch(error => setOperationMessage(operationError(error)));
  };

  const handleSellPosition = async (sellDate: string, sellPrice: number, sellShares: number) => {
    if (!sellModalData) return;
    const { position } = sellModalData;
    
    const saleId = crypto.randomUUID();
    await updateActivePortfolio(p => sellPosition(p, position.id, saleId, sellDate, sellPrice, sellShares));
    setSellModalData(null);
  };

  const handleCreatePortfolio = async (name: string) => {
    if (!user && !isGuest) return;
    const maxOrder = portfolios.reduce((max, p) => Math.max(max, p.sortOrder || 0), 0);
    const newPort: Portfolio = { 
      id: crypto.randomUUID(), 
      name, 
      positions: [], 
      closedPositions: [],
      userId: user?.uid || '',
      createdAt: Date.now(),
      sortOrder: maxOrder + 1
    };

    await performMutation('新增組合', async () => {
      if (isGuest) saveGuestPortfolios([...portfolios, newPort]);
      else await setDoc(doc(db, 'portfolios', newPort.id), newPort);
    });
    setActivePortfolioId(newPort.id);
    setActiveTab('active');
  };

  const handleRenamePortfolio = async (newName: string) => {
    if (!selectedRenamePortfolio) throw new Error('請重新選取要修改的組合。');
    const id = selectedRenamePortfolio.id;
    await performMutation('重新命名', async () => {
      if (isGuest) saveGuestPortfolios(portfolios.map(p => p.id === id ? { ...p, name: newName, updatedAt: Date.now() } : p));
      else await updateDoc(doc(db, 'portfolios', id), { name: newName, updatedAt: Date.now() });
    });
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (draggedId !== null && draggedId !== targetId) {
      setDragOverId(targetId);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    if (draggedId === null || draggedId === targetId) return;

    const oldIndex = portfolios.findIndex(p => p.id === draggedId);
    const newIndex = portfolios.findIndex(p => p.id === targetId);

    if (oldIndex === -1 || newIndex === -1) return;

    const updatedPortfolios = [...portfolios];
    const [removed] = updatedPortfolios.splice(oldIndex, 1);
    updatedPortfolios.splice(newIndex, 0, removed);

    const mapped = updatedPortfolios.map((p, idx) => ({ ...p, sortOrder: idx, updatedAt: Date.now() }));
    try {
      await performMutation('調整排序', async () => {
        if (isGuest) saveGuestPortfolios(mapped);
        else {
          const batch = writeBatch(db);
          mapped.forEach(p => batch.update(doc(db, 'portfolios', p.id), { sortOrder: p.sortOrder, updatedAt: p.updatedAt }));
          await batch.commit();
        }
      });
    } catch (error) {
      setOperationMessage(operationError(error));
    } finally {
      setDraggedId(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDeletePortfolio = async () => {
    if (!portfolioToDelete || operationInFlight.current) return;
    setDeleteError('');
    const id = portfolioToDelete.id;
    try {
      if (portfolios.length <= 1) throw new Error('請至少保留一個投資組合。');
      await performMutation('刪除組合', async () => {
        if (isGuest) saveGuestPortfolios(portfolios.filter(p => p.id !== id));
        else {
          const ref = doc(db, 'portfolios', id);
          await runTransaction(db, async transaction => {
            const existing = await transaction.get(ref);
            if (!existing.exists()) throw new Error('這個投資組合已不存在，請重新整理。');
            transaction.delete(ref);
          });
        }
      });
      setPortfolioToDelete(null);
    } catch (error) {
      setDeleteError(operationError(error));
    }
  };

  // Calculate Summary
  const summary: PortfolioSummary = positions.reduce(
    (acc, pos) => {
      const quote = quotes[pos.symbol] || quotes[pos.symbol + '.TW'] || quotes[pos.symbol + '.TWO'];
      const currentPrice = quote?.regularMarketPrice || pos.buyPrice;
      const currentValue = currentPrice * pos.shares;
      
      return {
        totalCost: acc.totalCost + pos.totalCost,
        totalValue: acc.totalValue + currentValue,
        totalReturn: acc.totalReturn + (currentValue - pos.totalCost),
        totalReturnPercent: 0,
      };
    },
    { totalCost: 0, totalValue: 0, totalReturn: 0, totalReturnPercent: 0 }
  );

  summary.totalReturnPercent = summary.totalCost > 0 ? (summary.totalReturn / summary.totalCost) * 100 : 0;
  const isOverallPositive = summary.totalReturn >= 0;

  const closedSummary = closedPositions.reduce(
    (acc, pos) => {
      return {
        totalCost: acc.totalCost + pos.totalCost,
        totalRealized: acc.totalRealized + pos.realizedReturn,
      };
    },
    { totalCost: 0, totalRealized: 0 }
  );
  const closedSummaryPercent = closedSummary.totalCost > 0 ? (closedSummary.totalRealized / closedSummary.totalCost) * 100 : 0;
  const isClosedPositive = closedSummary.totalRealized >= 0;

  const portfolioSummaries = portfolios.map(p => {
    const pSum = p.positions.reduce((acc, pos) => {
        const quote = quotes[pos.symbol] || quotes[pos.symbol + '.TW'] || quotes[pos.symbol + '.TWO'];
        const currentPrice = quote?.regularMarketPrice || pos.buyPrice;
        const currentValue = currentPrice * pos.shares;
        return {
          totalCost: acc.totalCost + pos.totalCost,
          totalValue: acc.totalValue + currentValue,
          totalReturn: acc.totalReturn + (currentValue - pos.totalCost),
        };
    }, { totalCost: 0, totalValue: 0, totalReturn: 0 });
    const totalReturnPercent = pSum.totalCost > 0 ? (pSum.totalReturn / pSum.totalCost) * 100 : 0;
    return { ...p, summary: { ...pSum, totalReturnPercent } };
  });

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#E5E7EB] font-sans selection:bg-[#C5A059]/30">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight gold-text serif flex items-center gap-2">
              <Activity className="gold-text" />
              如果我當初有買
            </h1>
            <p className="text-xs tracking-widest uppercase opacity-50 mt-2">台股歷史回測與模擬投資系統</p>
          </div>
          <div>
             {user ? (
                <div className="flex items-center gap-4">
                  <span className="text-sm text-[#6B7280]">{user.email}</span>
                  <button onClick={logout} disabled={!!pendingAction} className="p-2 rounded hover:bg-[#141417] text-[#6B7280] transition-colors" title="登出">
                    <LogOut size={18} />
                  </button>
                </div>
             ) : isGuest ? (
                <div className="flex items-center gap-4">
                  <span className="text-xs bg-[#1C1C1F] border border-[#222226] text-[#C5A059] px-2.5 py-1 rounded">
                    訪客體驗中 (本地端儲存)
                  </span>
                  <button 
                    onClick={() => {
                      setIsGuest(false);
                      localStorage.removeItem('is_guest_mode');
                    }} 
                    className="p-2 rounded hover:bg-[#141417] text-[#6B7280] transition-colors" 
                    title="結束體驗 / 登入"
                  >
                    <LogOut size={18} />
                  </button>
                </div>
             ) : (
                <button onClick={handleLogin} className="flex items-center gap-2 px-4 py-2 border border-[#C5A059] rounded text-[#C5A059] hover:bg-[#C5A059] hover:text-black transition-colors text-sm font-medium">
                  <LogIn size={16} /> Google 登入
                </button>
             )}
          </div>
        </header>

        {pendingAction && <p role="status" className="mb-4 text-sm text-[#C5A059]">{pendingAction}中…</p>}
        {operationMessage && <p role="alert" className="mb-4 text-sm text-red-300">{operationMessage}</p>}
        {isLoadingPortfolios && <p role="status" className="mb-4 text-sm">載入投資組合中…</p>}
        {user && !isLoadingPortfolios && portfolios.length === 0 && <p className="mb-4 text-sm">尚無投資組合，請按「＋ 組合」新增。</p>}

        {loginError && (
          <div className="mb-6 p-4 rounded bg-[#2D1616] border border-[#7A2B2B] text-[#FF9E9E] flex flex-col md:flex-row gap-2 justify-between items-start md:items-center text-sm">
            <div className="flex-1">
              <p className="font-semibold">{loginError}</p>
              <p className="text-xs opacity-85 mt-2">
                1. <strong>啟用 Google 登入</strong>：在 Firebase Console 中進入 Authentication，點選「登入方式」(Sign-in method) 頁籤，新增「Google」並啟用。<br/>
                2. <strong>新增授權網域</strong>：請至 Authentication 的「設定」(Settings) 頁面中的「授權網域」清單，將 <code>{window.location.hostname}</code> 新增進去。
              </p>
            </div>
            <button onClick={() => setLoginError(null)} className="text-xs underline hover:text-white mt-2 md:mt-0 px-2 py-1 bg-red-950/40 rounded border border-[#7A2B2B]/40">
              關閉提示
            </button>
          </div>
        )}

        {!user && !isGuest ? (
           <div className="h-[50vh] flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-[#1C1C1F] text-[#C5A059] rounded-full border border-[#333333] flex items-center justify-center mx-auto mb-6">
                <Wallet size={24} />
              </div>
              <h2 className="text-2xl font-serif text-[#E5E7EB] mb-2">雲端同步投資組合</h2>
              <p className="text-[#6B7280] max-w-md mb-8">
                登入您的 Google 帳戶以啟動您的雲端模擬投資組合。您的持倉、績效 and 操作紀錄將自動同步並永久儲存。
              </p>
              <div className="flex flex-col items-center gap-3">
                <button 
                  onClick={handleLogin}
                  className="gold-text border border-[#C5A059] hover:bg-[#C5A059] hover:text-[#0A0A0C] transition-colors rounded px-8 py-3 text-sm font-bold uppercase tracking-widest flex items-center gap-2"
                >
                   <LogIn size={18} />
                   立即登入 / 註冊
                </button>
                <button 
                  onClick={() => {
                    setIsGuest(true);
                    localStorage.setItem('is_guest_mode', 'true');
                  }}
                  className="mt-2 text-sm text-[#6B7280] hover:text-[#C5A059] transition-all duration-200 underline focus:outline-none py-1.5"
                >
                   直接以「訪客身份」體驗（免登入，資料存在瀏覽器）
                </button>
              </div>
           </div>
        ) : (
          <>
            {/* Portfolios Navigation */}
        <div className="flex gap-3 mb-8 overflow-x-auto pb-2 border-b border-[#222226] scrollbar-hide items-center">
          {portfolios.map(p => (
            <div 
              key={p.id}
              className={cn("flex items-center gap-1.5 px-3 py-2 rounded-t-lg border-b-2 text-sm flex-shrink-0 transition-all bg-[#0A0A0C] hover:bg-[#141417] group", 
                activePortfolioId === p.id && activeTab !== 'compare' 
                  ? "border-[#C5A059] text-[#C5A059]" 
                  : "border-transparent text-[#6B7280]"
              )}
            >
              <button 
                onClick={() => { setActivePortfolioId(p.id); if(activeTab === 'compare') setActiveTab('active'); }}
                className="transition-colors font-medium focus:outline-none"
              >
                {p.name}
              </button>
              {activePortfolioId === p.id && activeTab !== 'compare' && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedRenamePortfolio(p);
                      setIsRenameModalOpen(true);
                    }}
                    className="text-[#6B7280] hover:text-[#C5A059] transition-colors p-0.5 rounded hover:bg-[#1C1C1F]"
                    title="修改組合名稱"
                  >
                    <Edit2 size={12} />
                  </button>
                  {portfolios.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteError('');
                        setPortfolioToDelete({ id: p.id, name: p.name });
                      }}
                      className="text-[#6B7280] hover:text-red-500 transition-colors p-0.5 rounded hover:bg-[#1C1C1F]"
                      title="刪除組合"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          <button 
            disabled={!!pendingAction || isLoadingPortfolios}
            onClick={() => setIsPortfolioModalOpen(true)} 
            className="px-3 py-1.5 rounded border border-dashed border-[#333333] text-[#6B7280] hover:text-[#E5E7EB] text-sm flex-shrink-0 flex items-center gap-1 transition-colors"
          >
            <Plus size={14}/> 組合
          </button>
          <div className="flex-1 min-w-[20px]"></div>
          <button 
            onClick={() => setActiveTab('compare')}
            className={cn("px-4 py-2 rounded-lg text-sm flex-shrink-0 flex items-center gap-2 transition-colors", 
              activeTab === 'compare' 
                ? "bg-[#1C1C1F] text-[#C5A059]" 
                : "text-[#6B7280] hover:text-[#E5E7EB]"
            )}
          >
            <LayoutGrid size={16}/> 橫向比較
          </button>
        </div>

        {activeTab === 'compare' ? (
          <div>
            <h2 className="serif text-2xl mb-6 px-1 flex items-baseline gap-3">
              投資組合比較
              <span className="text-sm italic opacity-40 font-normal">Portfolio Comparison</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
              {portfolioSummaries.map(p => (
                 <div 
                   key={p.id} 
                   draggable={!pendingAction}
                   onDragStart={(e) => handleDragStart(e, p.id)}
                   onDragOver={(e) => handleDragOver(e, p.id)}
                   onDragLeave={handleDragLeave}
                   onDrop={(e) => handleDrop(e, p.id)}
                   onDragEnd={handleDragEnd}
                   className={cn(
                     "card-bg rounded-lg p-6 relative border transition-all cursor-grab active:cursor-grabbing",
                     draggedId === p.id 
                       ? "opacity-30 border-dashed border-[#C5A059]" 
                       : (dragOverId === p.id 
                           ? "border-[#C5A059] bg-[#141417] scale-[1.01]" 
                           : "border-[#222226]")
                   )}
                 >
                    <div className="flex items-center gap-2 mb-6 border-b border-[#222226]/40 pb-3">
                      <GripVertical size={16} className="text-[#6B7280] flex-shrink-0" />
                      <h3 className="text-xl serif gold-text font-medium flex-1 truncate">{p.name}</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center pb-2 border-b border-[#222226]/50">
                        <span className="label-text text-[#6B7280]">總投入成本</span>
                        <span className="font-mono text-[#E5E7EB]">{formatCurrency(p.summary.totalCost)}</span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-[#222226]/50">
                        <span className="label-text text-[#6B7280]">目前總市值</span>
                        <span className="font-mono text-lg">{formatCurrency(p.summary.totalValue)}</span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-[#222226]/50">
                        <span className="label-text text-[#6B7280]">總投資報酬</span>
                        <div className="text-right">
                          <p className={cn("font-mono text-lg", p.summary.totalReturn >= 0 ? "text-[#4ADE80]" : "text-[#F87171]")}>
                            {p.summary.totalReturn > 0 ? '+' : ''}{formatCurrency(p.summary.totalReturn)}
                          </p>
                          <p className={cn("text-xs font-mono", p.summary.totalReturnPercent >= 0 ? "text-[#4ADE80]" : "text-[#F87171]")}>
                             {formatPercent(p.summary.totalReturnPercent)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 pt-4 border-t border-[#222226]">
                      <h4 className="label-text mb-3 flex items-center gap-2 text-[#6B7280]">主要持股 ({p.positions.length})</h4>
                      <div className="space-y-2">
                        {p.positions.slice(0, 3).map(pos => (
                          <div key={pos.id} className="flex justify-between items-center text-sm">
                            <span className="text-[#E5E7EB]">{pos.symbol.replace(/\.TW(O)?$/, '')}</span>
                            <span className="text-[#6B7280] font-mono">{pos.shares} 股</span>
                          </div>
                        ))}
                      </div>
                      {p.positions.length > 3 && <p className="text-xs text-[#6B7280] mt-3">以及其他 {p.positions.length - 3} 檔...</p>}
                      {p.positions.length === 0 && <p className="text-xs text-[#6B7280]">目前無持股部位</p>}
                    </div>
                 </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
              <div className="flex bg-[#141417] border border-[#222226] rounded p-1 justify-center sm:justify-start">
                <button
                  onClick={() => setActiveTab('active')}
                  className={cn("px-4 py-1.5 text-sm rounded transition-colors whitespace-nowrap", activeTab === 'active' ? "bg-[#1C1C1F] text-[#C5A059] shadow-sm font-medium" : "text-[#6B7280] hover:text-[#E5E7EB]")}
                >
                  現有持倉
                </button>
                <button
                  onClick={() => setActiveTab('closed')}
                  className={cn("px-4 py-1.5 text-sm rounded transition-colors whitespace-nowrap", activeTab === 'closed' ? "bg-[#1C1C1F] text-[#C5A059] shadow-sm font-medium" : "text-[#6B7280] hover:text-[#E5E7EB]")}
                >
                  已平倉
                </button>
              </div>
              {activeTab === 'active' && (
                <div className="flex flex-wrap gap-2 justify-end">
                  <button disabled={!activePortfolio || !!pendingAction} onClick={() => setIsImportOpen(true)} className="px-3 py-2 rounded border border-[#C5A059] text-[#C5A059] text-sm disabled:opacity-40">匯入文字／表格</button>
                  <button 
                    onClick={fetchQuotes}
                    disabled={isRefreshing || positions.length === 0}
                    className="p-2 rounded border border-[#222226] bg-[#141417] text-[#E5E7EB] hover:bg-[#1C1C1F] transition-colors disabled:opacity-50"
                    title="更新報價"
                  >
                    <RefreshCw size={18} className={cn(isRefreshing && "animate-spin")} />
                  </button>
                  <button 
                    disabled={!activePortfolio || !!pendingAction}
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center justify-center gap-2 action-btn shadow-sm py-2 px-4 text-sm"
                  >
                    <Plus size={16} />
                    新增部位
                  </button>
                </div>
              )}
            </div>

            {/* Dashboard Summary */}
            {activeTab === 'active' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="card-bg rounded-lg p-6">
                  <div className="flex items-center gap-2 label-text mb-2">
                    <Wallet size={16} />
                    投入總成本
                  </div>
                  <p className="text-2xl font-light serif text-[#E5E7EB]">
                    {formatCurrency(summary.totalCost)}
                  </p>
                </div>
                
                <div className="card-bg rounded-lg p-6">
                  <div className="flex items-center gap-2 label-text mb-2">
                    <Activity size={16} />
                    目前總市值
                  </div>
                  <p className="text-2xl font-light serif text-[#E5E7EB]">
                    {formatCurrency(summary.totalValue)}
                  </p>
                </div>

                <div className="card-bg rounded-lg p-6">
                  <div className="flex items-center gap-2 label-text mb-2">
                    {isOverallPositive ? <TrendingUp size={16} className="text-[#4ADE80]" /> : <TrendingDown size={16} className="text-[#F87171]" />}
                    總投資報酬率
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className={cn("text-2xl font-light serif", isOverallPositive ? "green-glow" : (summary.totalReturn < 0 ? "red-glow" : "text-[#E5E7EB]"))}>
                      {isOverallPositive && summary.totalReturn > 0 ? '+' : ''}{formatCurrency(summary.totalReturn)}
                    </p>
                    <span className={cn("text-sm font-light serif", isOverallPositive ? "green-glow" : (summary.totalReturnPercent < 0 ? "red-glow" : "text-[#E5E7EB]"))}>
                       ({formatPercent(summary.totalReturnPercent)})
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                <div className="card-bg rounded-lg p-6">
                  <div className="flex items-center gap-2 label-text mb-2">
                    <Wallet size={16} />
                    平倉總成本
                  </div>
                  <p className="text-2xl font-light serif text-[#E5E7EB]">
                    {formatCurrency(closedSummary.totalCost)}
                  </p>
                </div>
                
                <div className="card-bg rounded-lg p-6">
                  <div className="flex items-center gap-2 label-text mb-2">
                    {isClosedPositive ? <TrendingUp size={16} className="text-[#4ADE80]" /> : <TrendingDown size={16} className="text-[#F87171]" />}
                    已實現總損益
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className={cn("text-2xl font-light serif", isClosedPositive ? "green-glow" : (closedSummary.totalRealized < 0 ? "red-glow" : "text-[#E5E7EB]"))}>
                      {isClosedPositive && closedSummary.totalRealized > 0 ? '+' : ''}{formatCurrency(closedSummary.totalRealized)}
                    </p>
                    <span className={cn("text-sm font-light serif", isClosedPositive ? "green-glow" : (closedSummaryPercent < 0 ? "red-glow" : "text-[#E5E7EB]"))}>
                       ({formatPercent(closedSummaryPercent)})
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Positions List */}
            <div>
              <h2 className="serif text-2xl mb-4 px-1 flex items-baseline gap-3">
                {activeTab === 'active' ? '持倉分析' : '歷史績效'}
                <span className="text-sm italic opacity-40 font-normal">
                  {activeTab === 'active' ? 'Position Analysis' : 'Closed Performance'}
                </span>
              </h2>
              
              {activeTab === 'active' ? (
                positions.length === 0 ? (
                  <div className="card-bg border-dashed border-[#333333] rounded-lg p-12 text-center">
                    <div className="w-16 h-16 bg-[#1C1C1F] text-[#6B7280] rounded-full border border-[#333333] flex items-center justify-center mx-auto mb-4">
                      <Activity size={24} />
                    </div>
                    <h3 className="text-[#E5E7EB] font-serif text-lg mb-1">尚無股票部位</h3>
                    <p className="text-[#6B7280] text-sm mb-6 max-w-sm mx-auto">
                      開始新增您的第一筆模擬倉部位，輸入台股代號、股數與買進日期來觀察歷史投資報酬率。
                    </p>
                    <button 
                      disabled={!activePortfolio || !!pendingAction}
                      onClick={() => setIsModalOpen(true)}
                      className="gold-text hover:opacity-80 transition-colors inline-flex items-center gap-2 uppercase tracking-wider text-sm font-medium border border-[#C5A059]/30 rounded px-4 py-2"
                    >
                      <Plus size={16} /> 新增模擬部位
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupedPositions.map((pos) => (
                      <PositionCard 
                        key={pos.symbol} 
                        position={pos} 
                        quote={quotes[pos.symbol] || quotes[pos.symbol + '.TW'] || quotes[pos.symbol + '.TWO']}
                        onRemove={handleRemovePosition}
                        onSell={(position, currentPrice) => setSellModalData({ position, currentPrice })}
                      />
                    ))}
                  </div>
                )
              ) : (
                closedPositions.length === 0 ? (
                  <div className="card-bg border-dashed border-[#333333] rounded-lg p-12 text-center">
                    <div className="w-16 h-16 bg-[#1C1C1F] text-[#6B7280] rounded-full border border-[#333333] flex items-center justify-center mx-auto mb-4">
                      <Activity size={24} />
                    </div>
                    <h3 className="text-[#E5E7EB] font-serif text-lg mb-1">尚無平倉紀錄</h3>
                    <p className="text-[#6B7280] text-sm mb-6 max-w-sm mx-auto">
                      當您從現有持倉中平倉(賣出)後，紀錄會顯示在這裡。
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {closedPositions.map((pos) => (
                      <ClosedPositionCard 
                        key={pos.id} 
                        position={pos}
                        onRemove={handleRemoveClosedPosition}
                      />
                    ))}
                  </div>
                )
              )}
            </div>
          </>
        )}
          </>
        )}
      </div>

      <AddPositionModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdd={handleAddPosition}
      />

      {isImportOpen && activePortfolio && <ImportHoldingsModal key={activePortfolio.id} portfolio={activePortfolio} onClose={() => setIsImportOpen(false)} onConfirm={handleImportHoldings} />}
      
      <SellPositionModal
        isOpen={!!sellModalData}
        onClose={() => setSellModalData(null)}
        position={sellModalData?.position || null}
        currentPrice={sellModalData?.currentPrice}
        onConfirm={handleSellPosition}
      />

      <PortfolioModal 
        isOpen={isPortfolioModalOpen}
        onClose={() => setIsPortfolioModalOpen(false)}
        onConfirm={handleCreatePortfolio}
      />

      <PortfolioModal 
        isOpen={isRenameModalOpen}
        onClose={() => {
          setIsRenameModalOpen(false);
          setSelectedRenamePortfolio(null);
        }}
        initialName={selectedRenamePortfolio?.name || ''}
        onConfirm={handleRenamePortfolio}
      />

      {portfolioToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="card-bg rounded-lg shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 border border-red-950/30">
            <div className="p-6 space-y-4 text-left">
              <h3 className="text-xl serif text-[#E5E7EB] font-semibold">確認刪除投資組合？</h3>
              <p className="text-sm text-[#8E9096] leading-relaxed">
                確定要刪除「<span className="text-[#C5A059] font-medium">{portfolioToDelete.name}</span>」嗎？此動作將會永久清除本組合之所有持倉與歷史平倉交易紀錄，且無法復原。
              </p>
              {deleteError && <p role="alert" className="text-sm text-red-300">{deleteError}</p>}
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setPortfolioToDelete(null)}
                  disabled={!!pendingAction}
                  className="w-1/2 px-4 py-2.5 rounded bg-neutral-900 border border-neutral-800 text-[#6B7280] hover:text-[#E5E7EB] transition-colors text-sm font-medium"
                >
                  取消
                </button>
                <button 
                  onClick={handleDeletePortfolio}
                  disabled={!!pendingAction}
                  className="w-1/2 px-4 py-2.5 rounded bg-red-950/40 text-red-200 border border-red-900/60 hover:bg-red-920 transition-colors text-sm font-medium"
                >
                  {pendingAction === '刪除組合' ? '刪除中…' : '確認刪除'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
