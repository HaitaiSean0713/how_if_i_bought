import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Wallet, TrendingUp, TrendingDown, Activity, RefreshCw, LayoutGrid, Trash2, LogOut, LogIn, Edit2, GripVertical } from 'lucide-react';
import { Position, QuoteData, PortfolioSummary, ClosedPosition, Portfolio } from './types';
import { cn } from './lib/utils';
import { AddPositionModal } from './components/AddPositionModal';
import { PositionCard, formatCurrency, formatPercent } from './components/PositionCard';
import { SellPositionModal } from './components/SellPositionModal';
import { ClosedPositionCard } from './components/ClosedPositionCard';
import { PortfolioModal } from './components/PortfolioModal';
import { auth, db, loginWithGoogle, logout } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './lib/firebaseErrors';

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sellModalData, setSellModalData] = useState<{ position: Position, currentPrice?: number } | null>(null);
  const [isPortfolioModalOpen, setIsPortfolioModalOpen] = useState(false);
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
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        if (!isGuest) {
          setPortfolios([]);
          setIsLoadingPortfolios(false);
        }
      } else {
        setIsGuest(false);
        localStorage.removeItem('is_guest_mode');
      }
    });
    return () => unsubscribe();
  }, [isGuest]);

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
        const parsed = JSON.parse(cached) as Portfolio[];
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
          setActivePortfolioId(parsed[0].id);
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

  // Migrate guest portfolios upon login
  useEffect(() => {
    if (!user) return;
    
    const migrateGuestPortfolios = async () => {
      try {
        const cached = localStorage.getItem('portfolios_guest');
        if (!cached) return;
        
        const parsed = JSON.parse(cached) as Portfolio[];
        if (parsed && parsed.length > 0) {
          const migratedPorts = parsed.map(port => ({
            ...port,
            userId: user.uid,
            updatedAt: Date.now()
          }));
          
          // Save them to Firestore and await successful write
          await Promise.all(migratedPorts.map(p => handleCreatePortfolioInDB(p)));
          
          // Only remove local storage on successful DB upload
          localStorage.removeItem('portfolios_guest');
          localStorage.removeItem('active_portfolio_id_guest');
          console.log("Guest portfolios migrated to Firestore successfully.");
        }
      } catch (err) {
        console.error("Failed to migrate guest portfolios:", err);
      }
    };
    
    migrateGuestPortfolios();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setIsLoadingPortfolios(true);
    const q = query(collection(db, 'portfolios'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedPortfolios: Portfolio[] = [];
      snapshot.forEach(doc => {
        loadedPortfolios.push(doc.data() as Portfolio);
      });
      // Optionally fallback if empty
      if (loadedPortfolios.length === 0) {
        // Check if there is guest portfolios waiting to be migrated
        const hasGuestData = !!localStorage.getItem('portfolios_guest');
        if (hasGuestData) {
          // Wait for migration to complete and trigger onSnapshot again
          return;
        }

        // Check localStorage backup before creating a new default portfolio
        const backupKey = `portfolios_${user.uid}`;
        const backup = localStorage.getItem(backupKey);
        if (backup) {
          try {
            const parsed = JSON.parse(backup) as Portfolio[];
            if (parsed && parsed.length > 0) {
              console.log('Restoring portfolios from localStorage backup');
              setPortfolios(parsed);
              setActivePortfolioId(parsed[0].id);
              // Re-sync backup data to Firestore
              parsed.forEach(p => handleCreatePortfolioInDB({ ...p, userId: user.uid }));
              setIsLoadingPortfolios(false);
              return;
            }
          } catch (e) {
            console.error('Failed to parse localStorage backup:', e);
          }
        }

        const defaultPort: Portfolio = {
          id: crypto.randomUUID(),
          name: '預設組合',
          positions: [],
          closedPositions: [],
          userId: user.uid,
          createdAt: Date.now(),
          sortOrder: 0
        };
        setPortfolios([defaultPort]);
        setActivePortfolioId(defaultPort.id);
        handleCreatePortfolioInDB(defaultPort);
      } else {
        // Sort portfolios: prioritize sortOrder, fallback to createdAt or 0
        loadedPortfolios.sort((a, b) => {
          const orderA = a.sortOrder !== undefined ? a.sortOrder : (a.createdAt || 0);
          const orderB = b.sortOrder !== undefined ? b.sortOrder : (b.createdAt || 0);
          return orderA - orderB;
        });
        setPortfolios(loadedPortfolios);
        setActivePortfolioId(prev => loadedPortfolios.some(p => p.id === prev) ? prev : loadedPortfolios[0].id);
        // Update localStorage backup with latest Firestore data
        localStorage.setItem(`portfolios_${user.uid}`, JSON.stringify(loadedPortfolios));
      }
      setIsLoadingPortfolios(false);
    }, (error) => {
      setIsLoadingPortfolios(false);
      // On Firestore error, try restoring from localStorage backup
      const backupKey = `portfolios_${user.uid}`;
      const backup = localStorage.getItem(backupKey);
      if (backup) {
        try {
          const parsed = JSON.parse(backup) as Portfolio[];
          if (parsed && parsed.length > 0) {
            console.log('Firestore error, restoring from localStorage backup');
            setPortfolios(parsed);
            setActivePortfolioId(parsed[0].id);
            return;
          }
        } catch (e) { /* ignore */ }
      }
      handleFirestoreError(error, OperationType.LIST, 'portfolios');
    });

    return () => unsubscribe();
  }, [user]);

  const handleCreatePortfolioInDB = async (port: Portfolio) => {
    try {
      await setDoc(doc(db, 'portfolios', port.id), port);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'portfolios/' + port.id);
    }
  };

  const syncActivePortfolio = async (updated: Portfolio) => {
    if (isGuest) {
      const idx = portfolios.findIndex(p => p.id === updated.id);
      if (idx !== -1) {
        const copy = [...portfolios];
        copy[idx] = { ...updated, updatedAt: Date.now() };
        setPortfolios(copy);
        localStorage.setItem('portfolios_guest', JSON.stringify(copy));
      }
      return;
    }
    // Firestore sync is non-blocking — optimistic update is already applied.
    // Any Firestore error (network, config, permission) is caught silently.
    // With persistentLocalCache, data is written to IndexedDB first and synced when online.
    try {
      await Promise.race([
        setDoc(doc(db, 'portfolios', updated.id), { ...updated, updatedAt: Date.now() }, { merge: true }),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('firestore_timeout')), 5000)
        ),
      ]);
    } catch (err: any) {
      // Always non-fatal — do NOT re-throw. UI update is already optimistically applied.
      if (err?.message === 'firestore_timeout') {
        console.warn('Firestore write timed out — data saved locally and will sync later.');
      } else {
        console.error('Firestore sync error (non-fatal):', err?.message || err);
      }
    }
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
    if (current) {
        const updated = updater(current);
        const updatedWithTimestamp = { ...updated, updatedAt: Date.now() };
        
        // Optimistic UI update
        const idx = portfolios.findIndex(p => p.id === updated.id);
        const originalPortfolios = [...portfolios];
        if (idx !== -1) {
          const copy = [...portfolios];
          copy[idx] = updatedWithTimestamp;
          setPortfolios(copy);

          // Always persist to localStorage as backup (guest & logged-in users)
          const storageKey = user ? `portfolios_${user.uid}` : 'portfolios_guest';
          localStorage.setItem(storageKey, JSON.stringify(copy));
        }
        
        // Background sync to Firestore (non-blocking, only for logged-in users)
        if (!isGuest) {
          syncActivePortfolio(updatedWithTimestamp).catch(err => {
            // Rollback on failure
            console.error('Firestore sync failed (non-blocking):', err);
            setPortfolios(originalPortfolios);
          });
        }
    } else {
        throw new Error("找不到作用中的投資組合");
    }
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
    updateActivePortfolio(p => ({ ...p, positions: p.positions.filter(pos => pos.id !== id) }));
  };

  const handleRemoveClosedPosition = (id: string) => {
    updateActivePortfolio(p => ({ ...p, closedPositions: p.closedPositions.filter(pos => pos.id !== id) }));
  };

  const handleSellPosition = async (sellDate: string, sellPrice: number) => {
    if (!sellModalData) return;
    const { position } = sellModalData;
    
    const realizedReturn = (sellPrice - position.buyPrice) * position.shares;
    const realizedReturnPercent = position.totalCost > 0 ? (realizedReturn / position.totalCost) * 100 : 0;

    const closedPos: ClosedPosition = {
      ...position,
      shortName: position.shortName || quotes[position.symbol]?.shortName,
      sellDate,
      sellPrice,
      realizedReturn,
      realizedReturnPercent,
    };

    try {
      await updateActivePortfolio(p => ({
        ...p,
        closedPositions: [closedPos, ...p.closedPositions],
        positions: p.positions.filter(pos => pos.id !== position.id)
      }));
      setSellModalData(null);
    } catch (err) {
      console.error('Failed to sell position:', err);
      alert('平倉失敗，請重試！');
    }
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

    if (isGuest) {
      const updatedList = [...portfolios, newPort];
      setPortfolios(updatedList);
      localStorage.setItem('portfolios_guest', JSON.stringify(updatedList));
      setActivePortfolioId(newPort.id);
      setActiveTab('active');
      return;
    }

    await handleCreatePortfolioInDB(newPort);
    setActivePortfolioId(newPort.id);
    setActiveTab('active');
  };

  const handleRenamePortfolio = async (newName: string) => {
    if (isGuest && selectedRenamePortfolio) {
      const updatedList = portfolios.map(p => 
        p.id === selectedRenamePortfolio.id ? { ...p, name: newName, updatedAt: Date.now() } : p
      );
      setPortfolios(updatedList);
      localStorage.setItem('portfolios_guest', JSON.stringify(updatedList));
      setSelectedRenamePortfolio(null);
      return;
    }
    if (!user || !selectedRenamePortfolio) return;
    try {
      const docRef = doc(db, 'portfolios', selectedRenamePortfolio.id);
      await setDoc(docRef, { name: newName, updatedAt: Date.now() }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'portfolios/' + selectedRenamePortfolio.id);
    }
    setSelectedRenamePortfolio(null);
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

    // Instant local feedback
    setPortfolios(updatedPortfolios);

    if (isGuest) {
      const mapped = updatedPortfolios.map((p, idx) => ({ ...p, sortOrder: idx, updatedAt: Date.now() }));
      setPortfolios(mapped);
      localStorage.setItem('portfolios_guest', JSON.stringify(mapped));
      setDraggedId(null);
      return;
    }

    // Save batch on Firestore
    const batch = writeBatch(db);
    updatedPortfolios.forEach((p, idx) => {
      const docRef = doc(db, 'portfolios', p.id);
      batch.update(docRef, { sortOrder: idx, updatedAt: Date.now() });
    });

    try {
      await batch.commit();
    } catch (err) {
      console.error("Failed to update sortOrder batch write:", err);
      handleFirestoreError(err, OperationType.UPDATE, 'portfolios_reorder');
    }

    setDraggedId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDeletePortfolio = async (id: string) => {
    if (portfolios.length <= 1) return;
    try {
        await deleteDoc(doc(db, 'portfolios', id));
    } catch(err) {
        handleFirestoreError(err, OperationType.DELETE, 'portfolios/' + id);
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
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight gold-text serif flex items-center gap-2">
              <Activity className="gold-text" />
              如果我當初有買
            </h1>
            <p className="text-xs tracking-widest uppercase opacity-50 mt-2">台股歷史回測與模擬投資系統</p>
          </div>
          <div>
             {user ? (
                <div className="flex items-center gap-4">
                  <span className="text-sm text-[#6B7280]">{user.email}</span>
                  <button onClick={logout} className="p-2 rounded hover:bg-[#141417] text-[#6B7280] transition-colors" title="登出">
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
                   draggable={true}
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
            <div className="flex items-center justify-between mb-6">
              <div className="flex bg-[#141417] border border-[#222226] rounded p-1">
                <button
                  onClick={() => setActiveTab('active')}
                  className={cn("px-4 py-1.5 text-sm rounded transition-colors whitespace-nowrap", activeTab === 'active' ? "bg-[#1C1C1F] text-[#C5A059] shadow-sm font-medium" : "text-[#6B7280] hover:text-[#E5E7EB]")}
                >
                  現有持仓
                </button>
                <button
                  onClick={() => setActiveTab('closed')}
                  className={cn("px-4 py-1.5 text-sm rounded transition-colors whitespace-nowrap", activeTab === 'closed' ? "bg-[#1C1C1F] text-[#C5A059] shadow-sm font-medium" : "text-[#6B7280] hover:text-[#E5E7EB]")}
                >
                  已平倉
                </button>
              </div>
              {activeTab === 'active' && (
                <div className="flex gap-2">
                  <button 
                    onClick={fetchQuotes}
                    disabled={isRefreshing || positions.length === 0}
                    className="p-2 rounded border border-[#222226] bg-[#141417] text-[#E5E7EB] hover:bg-[#1C1C1F] transition-colors disabled:opacity-50"
                    title="更新報價"
                  >
                    <RefreshCw size={18} className={cn(isRefreshing && "animate-spin")} />
                  </button>
                  <button 
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
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setPortfolioToDelete(null)}
                  className="w-1/2 px-4 py-2.5 rounded bg-neutral-900 border border-neutral-800 text-[#6B7280] hover:text-[#E5E7EB] transition-colors text-sm font-medium"
                >
                  取消
                </button>
                <button 
                  onClick={async () => {
                    const id = portfolioToDelete.id;
                    setPortfolioToDelete(null);
                    if (portfolios.length <= 1) return;
                    
                    if (activePortfolioId === id) {
                      const other = portfolios.find(p => p.id !== id);
                      if (other) {
                        setActivePortfolioId(other.id);
                      }
                    }

                    if (isGuest) {
                      const updatedList = portfolios.filter(p => p.id !== id);
                      setPortfolios(updatedList);
                      localStorage.setItem('portfolios_guest', JSON.stringify(updatedList));
                      return;
                    }

                    try {
                      await deleteDoc(doc(db, 'portfolios', id));
                    } catch (err) {
                      handleFirestoreError(err, OperationType.DELETE, 'portfolios/' + id);
                    }
                  }}
                  className="w-1/2 px-4 py-2.5 rounded bg-red-950/40 text-red-200 border border-red-900/60 hover:bg-red-920 transition-colors text-sm font-medium"
                >
                  確認刪除
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
