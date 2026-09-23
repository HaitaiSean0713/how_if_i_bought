import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Wallet, TrendingUp, TrendingDown, Activity, RefreshCw, LayoutGrid, Trash2, LogOut, LogIn, Edit2, GripVertical, Sparkles, ShieldCheck, FileSpreadsheet, Layers, Settings, FolderOpen } from 'lucide-react';
import { Position, QuoteData, PortfolioSummary, Portfolio } from './types';
import { cn } from './lib/utils';
import { AddPositionModal } from './components/AddPositionModal';
import { PositionCard, formatCurrency, formatPercent } from './components/PositionCard';
import { SellPositionModal } from './components/SellPositionModal';
import { ClosedPositionCard } from './components/ClosedPositionCard';
import { PortfolioModal } from './components/PortfolioModal';
import { GroupModal } from './components/GroupModal';
import { ImportHoldingsModal } from './components/ImportHoldingsModal';
import { CursorFollower } from './components/CursorFollower';
import { SpotlightCard } from './components/SpotlightCard';
import { holdingsVersion, planHoldingImport, type ImportRow } from './lib/holdingImport';
import { auth, db, loginWithGoogle, logout } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, setDoc, updateDoc, writeBatch, runTransaction } from 'firebase/firestore';
import { migrateGuestPortfolios } from './lib/guestMigration';
import { readPortfolioDocument, sortPortfolios, operationError, sellPosition, calculateGroupSummary } from './lib/portfolioOperations';

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
  const [selectedGroupModal, setSelectedGroupModal] = useState<string | null>(null);

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

  const existingGroups = useMemo(() => {
    const map = new Map<string, { name: string; initialCapital?: number; count: number }>();
    portfolios.forEach(p => {
      if (p.groupName) {
        const existing = map.get(p.groupName);
        if (existing) {
          existing.count += 1;
          if (p.groupInitialCapital !== undefined) {
            existing.initialCapital = p.groupInitialCapital;
          }
        } else {
          map.set(p.groupName, {
            name: p.groupName,
            initialCapital: p.groupInitialCapital,
            count: 1,
          });
        }
      }
    });
    return Array.from(map.values());
  }, [portfolios]);

  const activeGroupSummary = useMemo(() => {
    if (!activePortfolio?.groupName) return null;
    return calculateGroupSummary(activePortfolio.groupName, portfolios, quotes);
  }, [activePortfolio?.groupName, portfolios, quotes]);

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

  const handleCreatePortfolio = async (name: string, groupName?: string, groupInitialCapital?: number) => {
    if (!user && !isGuest) return;
    const maxOrder = portfolios.reduce((max, p) => Math.max(max, p.sortOrder || 0), 0);
    const newPort: Portfolio = { 
      id: crypto.randomUUID(), 
      name, 
      positions: [], 
      closedPositions: [],
      userId: user?.uid || '',
      createdAt: Date.now(),
      sortOrder: maxOrder + 1,
      ...(groupName ? { groupName } : {}),
      ...(groupInitialCapital !== undefined && !isNaN(groupInitialCapital) ? { groupInitialCapital } : {})
    };

    await performMutation('新增組合', async () => {
      if (isGuest) {
        let updatedPortfolios = [...portfolios, newPort];
        if (groupName && groupInitialCapital !== undefined && !isNaN(groupInitialCapital)) {
          updatedPortfolios = updatedPortfolios.map(p => p.groupName === groupName ? { ...p, groupInitialCapital } : p);
        }
        saveGuestPortfolios(updatedPortfolios);
      } else {
        const batch = writeBatch(db);
        const docData: any = {
          id: newPort.id,
          name: newPort.name,
          positions: newPort.positions,
          closedPositions: newPort.closedPositions,
          userId: newPort.userId,
          createdAt: newPort.createdAt,
          sortOrder: newPort.sortOrder,
        };
        if (groupName) {
          docData.groupName = groupName;
          if (groupInitialCapital !== undefined && !isNaN(groupInitialCapital)) {
            docData.groupInitialCapital = groupInitialCapital;
          }
        }
        batch.set(doc(db, 'portfolios', newPort.id), docData);
        if (groupName && groupInitialCapital !== undefined && !isNaN(groupInitialCapital)) {
          portfolios.filter(p => p.groupName === groupName).forEach(p => {
            batch.update(doc(db, 'portfolios', p.id), { groupInitialCapital });
          });
        }
        await batch.commit();
      }
    });
    setActivePortfolioId(newPort.id);
    setActiveTab('active');
  };

  const handleRenamePortfolio = async (newName: string, groupName?: string, groupInitialCapital?: number) => {
    if (!selectedRenamePortfolio) throw new Error('請重新選取要修改的組合。');
    const id = selectedRenamePortfolio.id;
    await performMutation('更新組合', async () => {
      if (isGuest) {
        let updated = portfolios.map(p => {
          if (p.id === id) {
            const copy = { ...p, name: newName, updatedAt: Date.now() };
            if (groupName) {
              copy.groupName = groupName;
              copy.groupInitialCapital = groupInitialCapital;
            } else {
              delete copy.groupName;
              delete copy.groupInitialCapital;
            }
            return copy;
          }
          if (groupName && p.groupName === groupName && groupInitialCapital !== undefined && !isNaN(groupInitialCapital)) {
            return { ...p, groupInitialCapital, updatedAt: Date.now() };
          }
          return p;
        });
        saveGuestPortfolios(updated);
      } else {
        const batch = writeBatch(db);
        const updatePayload: Record<string, any> = {
          name: newName,
          updatedAt: Date.now(),
        };
        if (groupName) {
          updatePayload.groupName = groupName;
          if (groupInitialCapital !== undefined && !isNaN(groupInitialCapital)) {
            updatePayload.groupInitialCapital = groupInitialCapital;
          } else {
            updatePayload.groupInitialCapital = null;
          }
        } else {
          updatePayload.groupName = null;
          updatePayload.groupInitialCapital = null;
        }
        batch.update(doc(db, 'portfolios', id), updatePayload);
        if (groupName && groupInitialCapital !== undefined && !isNaN(groupInitialCapital)) {
          portfolios.filter(p => p.id !== id && p.groupName === groupName).forEach(p => {
            batch.update(doc(db, 'portfolios', p.id), { groupInitialCapital, updatedAt: Date.now() });
          });
        }
        await batch.commit();
      }
    });
  };

  const handleSaveGroup = async (oldGroupName: string, newGroupName: string, newCapital?: number) => {
    const memberPortfolios = portfolios.filter(p => p.groupName === oldGroupName);
    if (memberPortfolios.length === 0) return;

    await performMutation('更新群組', async () => {
      if (isGuest) {
        const updated = portfolios.map(p => {
          if (p.groupName === oldGroupName) {
            const copy = { ...p, groupName: newGroupName, updatedAt: Date.now() };
            if (newCapital !== undefined && !isNaN(newCapital)) {
              copy.groupInitialCapital = newCapital;
            } else {
              delete copy.groupInitialCapital;
            }
            return copy;
          }
          return p;
        });
        saveGuestPortfolios(updated);
      } else {
        const batch = writeBatch(db);
        memberPortfolios.forEach(p => {
          const updatePayload: Record<string, any> = {
            groupName: newGroupName,
            updatedAt: Date.now(),
          };
          if (newCapital !== undefined && !isNaN(newCapital)) {
            updatePayload.groupInitialCapital = newCapital;
          } else {
            updatePayload.groupInitialCapital = null;
          }
          batch.update(doc(db, 'portfolios', p.id), updatePayload);
        });
        await batch.commit();
      }
    });
  };

  const handleDissolveGroup = async (groupName: string) => {
    const memberPortfolios = portfolios.filter(p => p.groupName === groupName);
    if (memberPortfolios.length === 0) return;

    await performMutation('解散群組', async () => {
      if (isGuest) {
        const updated = portfolios.map(p => {
          if (p.groupName === groupName) {
            const copy = { ...p, updatedAt: Date.now() };
            delete copy.groupName;
            delete copy.groupInitialCapital;
            return copy;
          }
          return p;
        });
        saveGuestPortfolios(updated);
      } else {
        const batch = writeBatch(db);
        memberPortfolios.forEach(p => {
          batch.update(doc(db, 'portfolios', p.id), {
            groupName: null,
            groupInitialCapital: null,
            updatedAt: Date.now(),
          });
        });
        await batch.commit();
      }
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
    <div className="min-h-screen bg-[#000000] text-[#F5F5F7] font-sans selection:bg-white/20">
      <CursorFollower />
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10">
        {/* Floating Apple Dynamic Island Header */}
        <header className="mb-8 p-3 sm:px-6 sm:py-3.5 rounded-3xl apple-glass flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-white/20 to-white/5 border border-white/20 flex items-center justify-center text-white shadow-[0_2px_10px_rgba(255,255,255,0.1)]">
                <Activity size={17} className="text-white" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight apple-silver-text apple-title">
                如果我當初有買
              </h1>
            </div>
            <div className="flex items-center gap-2.5 mt-1 sm:ml-11">
              <p className="text-[11px] tracking-tight text-[#8E8E93]">台股歷史回測與模擬投資系統</p>
              <span className="text-white/20">•</span>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[#30D158] text-[10px] font-mono font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[#30D158] animate-pulse" />
                即時行情連線
              </div>
            </div>
          </div>
          <div>
             {user ? (
                <div className="flex items-center gap-3 bg-white/[0.05] backdrop-blur-2xl px-3.5 py-1.5 rounded-full border border-white/10">
                  <div className="w-2 h-2 rounded-full bg-[#30D158]" />
                  <span className="text-xs font-mono text-[#D1D1D6] max-w-[180px] truncate">{user.email}</span>
                  <button onClick={logout} disabled={!!pendingAction} className="p-1 rounded-full hover:bg-white/10 text-[#8E8E93] hover:text-white transition-colors" title="登出">
                    <LogOut size={14} />
                  </button>
                </div>
             ) : isGuest ? (
                <div className="flex items-center gap-3 bg-white/[0.06] backdrop-blur-2xl px-4 py-1.5 rounded-full border border-white/15 shadow-sm">
                  <span className="text-xs text-white/90 font-medium flex items-center gap-1.5 tracking-tight">
                    <ShieldCheck size={14} className="text-emerald-400" /> 訪客模式 (本地儲存)
                  </span>
                  <button 
                    onClick={() => {
                      setIsGuest(false);
                      localStorage.removeItem('is_guest_mode');
                    }} 
                    className="p-1 rounded-full hover:bg-white/10 text-[#8E8E93] hover:text-white transition-colors" 
                    title="結束體驗 / 登入"
                  >
                    <LogOut size={14} />
                  </button>
                </div>
             ) : (
                <motion.button 
                  whileTap={{ scale: 0.97 }}
                  onClick={handleLogin} 
                  className="action-btn text-xs sm:text-sm font-medium"
                >
                  <LogIn size={15} /> Google 登入
                </motion.button>
             )}
          </div>
        </header>

        {pendingAction && <p role="status" className="mb-4 text-xs text-[#8E8E93] flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 w-fit"><RefreshCw size={13} className="animate-spin text-white" /> {pendingAction}中…</p>}
        {operationMessage && <p role="alert" className="mb-4 text-xs text-rose-300 bg-rose-950/30 border border-rose-900/50 p-3 rounded-2xl">{operationMessage}</p>}
        {isLoadingPortfolios && <p role="status" className="mb-4 text-xs text-[#8E8E93] flex items-center gap-2"><RefreshCw size={13} className="animate-spin text-white" /> 載入投資組合中…</p>}
        {user && !isLoadingPortfolios && portfolios.length === 0 && <p className="mb-4 text-xs text-[#8E8E93]">尚無投資組合，請按「＋ 組合」新增。</p>}

        {loginError && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-950/40 border border-rose-900/60 text-rose-200 flex flex-col md:flex-row gap-2 justify-between items-start md:items-center text-xs shadow-xl">
            <div className="flex-1">
              <p className="font-semibold">{loginError}</p>
              <p className="text-[11px] opacity-80 mt-1.5">
                1. <strong>啟用 Google 登入</strong>：在 Firebase Console 中進入 Authentication，點選「登入方式」(Sign-in method) 頁籤，新增「Google」並啟用。<br/>
                2. <strong>新增授權網域</strong>：請至 Authentication 的「設定」(Settings) 頁面中的「授權網域」清單，將 <code>{window.location.hostname}</code> 新增進去。
              </p>
            </div>
            <button onClick={() => setLoginError(null)} className="text-xs underline hover:text-white mt-2 md:mt-0 px-2 py-1 bg-red-950/40 rounded-full border border-rose-900/50">
              關閉提示
            </button>
          </div>
        )}

        {!user && !isGuest ? (
           <motion.div 
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ duration: 0.5 }}
             className="relative my-10 py-16 px-6 sm:px-12 rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-3xl text-center overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
           >
              {/* Apple Ambient Spotlight glow */}
              <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[500px] h-[350px] bg-gradient-to-b from-indigo-500/20 via-sky-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />
              
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.06] border border-white/15 text-white/90 text-xs font-medium mb-6 backdrop-blur-md">
                <Sparkles size={14} className="text-sky-300" />
                台股歷史回測與模擬投資系統
              </div>

              <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-4 apple-silver-text apple-title max-w-2xl mx-auto leading-tight">
                如果我當初買了這檔股票，<br/><span className="apple-silver-text">現在會賺多少？</span>
              </h2>
              
              <p className="text-[#8E8E93] max-w-lg mx-auto mb-8 text-sm sm:text-base leading-relaxed font-normal">
                精準還原歷史收盤價，模擬計算投資回報率、未實現損益與平倉成效。支援對帳單文字、Excel/CSV 表格與券商截圖智能解析。
              </p>

              <div className="flex flex-wrap justify-center gap-2 mb-10 max-w-lg mx-auto">
                <span className="text-xs px-3.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[#D1D1D6]">免註冊訪客模式</span>
                <span className="text-xs px-3.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[#D1D1D6]">支援上市櫃與 ETF (2,700+ 檔)</span>
                <span className="text-xs px-3.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[#D1D1D6]">AI 智能與截圖辨識</span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <motion.button 
                  whileTap={{ scale: 0.97 }}
                  onClick={handleLogin}
                  className="action-btn px-7 py-3 text-sm font-semibold shadow-lg flex items-center gap-2 w-full sm:w-auto justify-center"
                >
                   <LogIn size={17} />
                   立即登入 / 註冊同步
                </motion.button>
                <button 
                  onClick={() => {
                    setIsGuest(true);
                    localStorage.setItem('is_guest_mode', 'true');
                  }}
                  className="action-btn-secondary px-6 py-3 text-sm font-medium w-full sm:w-auto"
                >
                   直接以「訪客身份」體驗（免登入）
                </button>
              </div>
           </motion.div>
        ) : (
          <>
            {/* Apple Segmented Control - Portfolios Navigation */}
        <div className="flex gap-1.5 mb-8 overflow-x-auto p-1.5 bg-white/[0.03] backdrop-blur-2xl rounded-2xl border border-white/[0.08] scrollbar-hide items-center shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
          {portfolios.map(p => {
            const isActive = activePortfolioId === p.id && activeTab !== 'compare';
            return (
              <div 
                key={p.id}
                className="relative flex items-center flex-shrink-0"
              >
                <button 
                  onClick={() => { setActivePortfolioId(p.id); if(activeTab === 'compare') setActiveTab('active'); }}
                  className={cn(
                    "relative px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors z-10 flex items-center gap-1.5 focus:outline-none tracking-tight",
                    isActive 
                      ? "text-white font-semibold" 
                      : "text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-white/5"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activePortfolioPill"
                      className="absolute inset-0 bg-white/15 border border-white/20 rounded-xl -z-10 shadow-[0_2px_10px_rgba(255,255,255,0.08)]"
                      transition={{ type: 'spring', bounce: 0.16, duration: 0.35 }}
                    />
                  )}
                  <span className="truncate max-w-[120px] sm:max-w-none">{p.name}</span>
                  {p.groupName && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/15 border border-blue-500/25 text-blue-300 font-normal flex-shrink-0">
                      {p.groupName}
                    </span>
                  )}
                </button>
                {isActive && (
                  <div className="flex items-center gap-0.5 ml-1 mr-1.5 z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRenamePortfolio(p);
                        setIsRenameModalOpen(true);
                      }}
                      className="text-white/70 hover:text-white transition-colors p-1 rounded-md hover:bg-white/10"
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
                        className="text-white/70 hover:text-[#FF453A] transition-colors p-1 rounded-md hover:bg-white/10"
                        title="刪除組合"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <button 
            disabled={!!pendingAction || isLoadingPortfolios}
            onClick={() => setIsPortfolioModalOpen(true)} 
            className="px-3 py-1.5 rounded-xl border border-dashed border-white/20 text-[#8E8E93] hover:text-white hover:border-white/40 text-xs flex-shrink-0 flex items-center gap-1.5 transition-all ml-1"
          >
            <Plus size={14}/> 組合
          </button>
          <div className="flex-1 min-w-[8px]"></div>
          <button 
            onClick={() => setActiveTab('compare')}
            className={cn(
              "relative px-3.5 py-1.5 rounded-xl text-xs font-medium flex-shrink-0 flex items-center gap-1.5 transition-colors z-10 tracking-tight", 
              activeTab === 'compare' 
                ? "text-white font-semibold" 
                : "text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-white/5"
            )}
          >
            {activeTab === 'compare' && (
              <motion.div
                layoutId="activePortfolioPill"
                className="absolute inset-0 bg-white/15 border border-white/20 rounded-xl -z-10 shadow-[0_2px_10px_rgba(255,255,255,0.08)]"
                transition={{ type: 'spring', bounce: 0.16, duration: 0.35 }}
              />
            )}
            <LayoutGrid size={14}/> 橫向比較
          </button>
        </div>

        {activeTab === 'compare' ? (
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-6 px-1 flex items-baseline gap-3 apple-title">
              投資組合比較
              <span className="text-xs uppercase tracking-wider text-[#8E8E93] font-normal">Portfolio Comparison</span>
            </h2>

            {existingGroups.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold tracking-tight text-[#8E8E93] uppercase mb-3 px-1 flex items-center gap-2">
                  <Layers size={14} className="text-blue-400" />
                  群組資金池總覽 (Group Summaries)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {existingGroups.map(g => {
                    const gSummary = calculateGroupSummary(g.name, portfolios, quotes);
                    return (
                      <SpotlightCard key={g.name} className="border border-blue-500/20 bg-gradient-to-b from-blue-950/15 via-white/[0.01] to-transparent p-5">
                        <div className="flex justify-between items-start mb-3 border-b border-white/[0.06] pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-white tracking-tight">{g.name}</h4>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium">群組</span>
                            </div>
                            <p className="text-xs text-[#8E8E93] mt-0.5">{gSummary.portfolios.length} 個投資組合</p>
                          </div>
                          <button
                            onClick={() => setSelectedGroupModal(g.name)}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                            title="管理群組"
                          >
                            <Settings size={14} />
                          </button>
                        </div>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between text-[#8E8E93]">
                            <span>共同初始資金</span>
                            <span className="font-mono text-white font-medium">{gSummary.initialCapital !== undefined ? formatCurrency(gSummary.initialCapital) : '未設定'}</span>
                          </div>
                          <div className="flex justify-between text-[#8E8E93]">
                            <span>已動用成本</span>
                            <span className="font-mono text-white">{formatCurrency(gSummary.totalCost)}</span>
                          </div>
                          <div className="flex justify-between text-[#8E8E93]">
                            <span>剩餘可用資金</span>
                            <span className={cn("font-mono", gSummary.remainingCash !== undefined && gSummary.remainingCash < 0 ? "text-[#FF453A]" : "text-white")}>
                              {gSummary.remainingCash !== undefined ? formatCurrency(gSummary.remainingCash) : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between text-[#8E8E93]">
                            <span>群組股票市值</span>
                            <span className="font-mono text-white font-medium">{formatCurrency(gSummary.totalValue)}</span>
                          </div>
                          <div className="flex justify-between text-[#8E8E93] pt-2 border-t border-white/[0.06]">
                            <span>資本總回報</span>
                            <span className={cn("font-mono font-semibold", gSummary.totalReturn >= 0 ? "text-[#30D158]" : "text-[#FF453A]")}>
                              {gSummary.totalReturn > 0 ? '+' : ''}{formatCurrency(gSummary.totalReturn)} ({formatPercent(gSummary.totalReturnPercent)})
                            </span>
                          </div>
                        </div>
                      </SpotlightCard>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
              {portfolioSummaries.map(p => (
                 <SpotlightCard 
                   key={p.id} 
                   layout
                   initial={{ opacity: 0, y: 15 }}
                   animate={{ opacity: 1, y: 0 }}
                   whileHover={{ y: -3, transition: { duration: 0.15 } }}
                   draggable={!pendingAction}
                   onDragStart={(e: any) => handleDragStart(e, p.id)}
                   onDragOver={(e) => handleDragOver(e, p.id)}
                   onDragLeave={handleDragLeave}
                   onDrop={(e) => handleDrop(e, p.id)}
                   onDragEnd={handleDragEnd}
                   className={cn(
                     "border transition-all cursor-grab active:cursor-grabbing",
                     draggedId === p.id 
                       ? "opacity-30 border-dashed border-white/40" 
                       : (dragOverId === p.id 
                           ? "border-white/60 bg-white/[0.08] scale-[1.01]" 
                           : "border-white/[0.08]")
                   )}
                 >
                    <div className="p-6">
                      <div className="flex items-center gap-2 mb-5 border-b border-white/[0.08] pb-3">
                        <GripVertical size={16} className="text-[#8E8E93] flex-shrink-0" />
                        <h3 className="text-lg font-semibold text-white tracking-tight flex-1 truncate">{p.name}</h3>
                        {p.groupName && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 font-medium flex-shrink-0">
                            {p.groupName}
                          </span>
                        )}
                      </div>
                      <div className="space-y-3.5">
                        <div className="flex justify-between items-center pb-2 border-b border-white/[0.05]">
                          <span className="text-xs text-[#8E8E93]">總投入成本</span>
                          <span className="font-mono text-[#F5F5F7] text-sm tabular-nums">{formatCurrency(p.summary.totalCost)}</span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-white/[0.05]">
                          <span className="text-xs text-[#8E8E93]">目前總市值</span>
                          <span className="font-mono text-base tabular-nums text-white font-medium">{formatCurrency(p.summary.totalValue)}</span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-white/[0.05]">
                          <span className="text-xs text-[#8E8E93]">總投資報酬</span>
                          <div className="text-right">
                            <p className={cn("font-mono text-base tabular-nums font-semibold tracking-tight", p.summary.totalReturn >= 0 ? "text-[#30D158]" : "text-[#FF453A]")}>
                              {p.summary.totalReturn > 0 ? '+' : ''}{formatCurrency(p.summary.totalReturn)}
                            </p>
                            <p className={cn("text-xs font-mono tabular-nums", p.summary.totalReturnPercent >= 0 ? "text-[#30D158]" : "text-[#FF453A]")}>
                               {formatPercent(p.summary.totalReturnPercent)}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-5 pt-4 border-t border-white/[0.08]">
                        <h4 className="text-xs text-[#8E8E93] mb-3 font-medium">主要持股 ({p.positions.length})</h4>
                        <div className="space-y-2">
                          {p.positions.slice(0, 3).map(pos => (
                            <div key={pos.id} className="flex justify-between items-center text-xs">
                              <span className="text-[#F5F5F7] font-medium">{pos.symbol.replace(/\.TW(O)?$/, '')}</span>
                              <span className="text-[#8E8E93] font-mono">{pos.shares} 股</span>
                            </div>
                          ))}
                        </div>
                        {p.positions.length > 3 && <p className="text-[11px] text-[#8E8E93] mt-2.5">以及其他 {p.positions.length - 3} 檔...</p>}
                        {p.positions.length === 0 && <p className="text-xs text-[#8E8E93]">目前無持股部位</p>}
                      </div>
                    </div>
                 </SpotlightCard>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
              {/* Apple Segmented Control Sub-Tabs */}
              <div className="flex bg-white/[0.03] border border-white/[0.08] rounded-2xl p-1 justify-center sm:justify-start backdrop-blur-2xl shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
                <button
                  onClick={() => setActiveTab('active')}
                  className={cn(
                    "relative px-4 py-1.5 text-xs sm:text-sm font-medium rounded-xl transition-colors whitespace-nowrap z-10 tracking-tight",
                    activeTab === 'active' ? "text-white font-semibold" : "text-[#8E8E93] hover:text-white"
                  )}
                >
                  {activeTab === 'active' && (
                    <motion.div
                      layoutId="activeSubTabIndicator"
                      className="absolute inset-0 bg-white/15 border border-white/20 rounded-xl -z-10 shadow-[0_2px_10px_rgba(255,255,255,0.08)]"
                      transition={{ type: 'spring', bounce: 0.16, duration: 0.35 }}
                    />
                  )}
                  現有持倉 ({positions.length})
                </button>
                <button
                  onClick={() => setActiveTab('closed')}
                  className={cn(
                    "relative px-4 py-1.5 text-xs sm:text-sm font-medium rounded-xl transition-colors whitespace-nowrap z-10 tracking-tight",
                    activeTab === 'closed' ? "text-white font-semibold" : "text-[#8E8E93] hover:text-white"
                  )}
                >
                  {activeTab === 'closed' && (
                    <motion.div
                      layoutId="activeSubTabIndicator"
                      className="absolute inset-0 bg-white/15 border border-white/20 rounded-xl -z-10 shadow-[0_2px_10px_rgba(255,255,255,0.08)]"
                      transition={{ type: 'spring', bounce: 0.16, duration: 0.35 }}
                    />
                  )}
                  已平倉 ({closedPositions.length})
                </button>
              </div>

              {activeTab === 'active' && (
                <div className="flex flex-wrap gap-2.5 justify-end items-center">
                  <button 
                    disabled={!activePortfolio || !!pendingAction} 
                    onClick={() => setIsImportOpen(true)} 
                    className="action-btn-secondary px-3.5 py-1.5 text-xs sm:text-sm flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <FileSpreadsheet size={15} className="text-[#A1A1A6]" />
                    匯入文字／表格
                  </button>
                  <button 
                    onClick={fetchQuotes}
                    disabled={isRefreshing || positions.length === 0}
                    className="p-2 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/10 text-[#F5F5F7] transition-colors disabled:opacity-40"
                    title="更新即時報價"
                  >
                    <RefreshCw size={15} className={cn(isRefreshing && "animate-spin text-white")} />
                  </button>
                  <motion.button 
                    whileTap={{ scale: 0.97 }}
                    disabled={!activePortfolio || !!pendingAction}
                    onClick={() => setIsModalOpen(true)}
                    className="action-btn py-1.5 px-4 text-xs sm:text-sm font-semibold shadow-md flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Plus size={16} />
                    新增部位
                  </motion.button>
                </div>
              )}
            </div>

            {/* Portfolio Group Summary Banner */}
            {activeGroupSummary && (
              <SpotlightCard className="mb-6 border border-blue-500/20 bg-gradient-to-r from-blue-950/20 via-white/[0.02] to-indigo-950/20 shadow-[0_8px_30px_rgb(0,0,0,0.4)]">
                <div className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-white/[0.08]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-blue-400">
                        <Layers size={16} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold text-white tracking-tight">{activeGroupSummary.groupName}</h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 font-medium">群組總覽</span>
                        </div>
                        <p className="text-xs text-[#8E8E93] mt-0.5">包含 {activeGroupSummary.portfolios.length} 個投資組合的共享資金池與綜觀分析</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedGroupModal(activeGroupSummary.groupName)}
                      className="self-start sm:self-auto action-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5 text-white/80 hover:text-white"
                    >
                      <Settings size={13} />
                      管理群組設定
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                      <span className="text-[11px] font-medium text-[#8E8E93] block mb-1">共同初始資金</span>
                      <span className="text-sm sm:text-base font-semibold text-white font-mono tabular-nums">
                        {activeGroupSummary.initialCapital !== undefined ? formatCurrency(activeGroupSummary.initialCapital) : '未設定'}
                      </span>
                    </div>
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                      <span className="text-[11px] font-medium text-[#8E8E93] block mb-1">群組已用成本</span>
                      <span className="text-sm sm:text-base font-semibold text-white font-mono tabular-nums">
                        {formatCurrency(activeGroupSummary.totalCost)}
                      </span>
                      {activeGroupSummary.initialCapital ? (
                        <span className="text-[10px] text-[#8E8E93] font-mono block mt-0.5">
                          佔資金 {((activeGroupSummary.totalCost / activeGroupSummary.initialCapital) * 100).toFixed(1)}%
                        </span>
                      ) : null}
                    </div>
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                      <span className="text-[11px] font-medium text-[#8E8E93] block mb-1">剩餘可用資金</span>
                      <span className={cn("text-sm sm:text-base font-semibold font-mono tabular-nums", activeGroupSummary.remainingCash !== undefined && activeGroupSummary.remainingCash < 0 ? "text-[#FF453A]" : "text-white")}>
                        {activeGroupSummary.remainingCash !== undefined ? formatCurrency(activeGroupSummary.remainingCash) : '—'}
                      </span>
                      {activeGroupSummary.initialCapital !== undefined && activeGroupSummary.remainingCash !== undefined ? (
                        <span className="text-[10px] text-[#8E8E93] font-mono block mt-0.5">
                          佔資金 {((activeGroupSummary.remainingCash / activeGroupSummary.initialCapital) * 100).toFixed(1)}%
                        </span>
                      ) : null}
                    </div>
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                      <span className="text-[11px] font-medium text-[#8E8E93] block mb-1">群組股票市值</span>
                      <span className="text-sm sm:text-base font-semibold text-white font-mono tabular-nums">
                        {formatCurrency(activeGroupSummary.totalValue)}
                      </span>
                    </div>
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                      <span className="text-[11px] font-medium text-[#8E8E93] block mb-1">群組整體淨值</span>
                      <span className="text-sm sm:text-base font-semibold text-white font-mono tabular-nums">
                        {activeGroupSummary.totalNetWorth !== undefined ? formatCurrency(activeGroupSummary.totalNetWorth) : formatCurrency(activeGroupSummary.totalValue)}
                      </span>
                      <span className="text-[10px] text-[#8E8E93] block mt-0.5">
                        {activeGroupSummary.initialCapital !== undefined ? '現金 + 股票市值' : '股票市值'}
                      </span>
                    </div>
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                      <span className="text-[11px] font-medium text-[#8E8E93] block mb-1">整體資本回報</span>
                      <span className={cn("text-sm sm:text-base font-semibold font-mono tabular-nums", activeGroupSummary.totalReturn >= 0 ? "text-[#30D158]" : "text-[#FF453A]")}>
                        {activeGroupSummary.totalReturn > 0 ? '+' : ''}{formatCurrency(activeGroupSummary.totalReturn)}
                      </span>
                      <span className={cn("text-[10px] font-mono font-medium block mt-0.5", activeGroupSummary.totalReturn >= 0 ? "text-[#30D158]" : "text-[#FF453A]")}>
                        {formatPercent(activeGroupSummary.totalReturnPercent)}
                      </span>
                    </div>
                  </div>

                  {/* Member portfolios quick switcher */}
                  <div className="flex items-center gap-2 overflow-x-auto pt-1 scrollbar-hide text-xs">
                    <span className="text-[#8E8E93] flex-shrink-0">群組成員：</span>
                    {activeGroupSummary.portfolios.map(mp => (
                      <button
                        key={mp.id}
                        onClick={() => setActivePortfolioId(mp.id)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg border text-xs font-mono transition-all flex items-center gap-1.5 flex-shrink-0",
                          mp.id === activePortfolioId
                            ? "bg-white/15 border-white/30 text-white font-medium shadow-xs"
                            : "bg-white/[0.03] border-white/[0.08] text-[#8E8E93] hover:text-white hover:bg-white/[0.06]"
                        )}
                      >
                        <span>{mp.name}</span>
                        <span className="text-[10px] opacity-60">({mp.positions.length}檔持倉)</span>
                      </button>
                    ))}
                  </div>
                </div>
              </SpotlightCard>
            )}

            {/* Apple Spotlight Bento Grid Dashboard */}
            {activeTab === 'active' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
                <SpotlightCard className="border border-white/[0.08] shadow-[0_8px_30px_rgb(0,0,0,0.4)]">
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-[#8E8E93]">投入總成本</span>
                      <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-[#8E8E93] group-hover:text-white transition-colors">
                        <Wallet size={16} />
                      </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-semibold text-white tabular-nums tracking-tight font-mono">
                      {formatCurrency(summary.totalCost)}
                    </p>
                  </div>
                </SpotlightCard>
                
                <SpotlightCard className="border border-white/[0.08] shadow-[0_8px_30px_rgb(0,0,0,0.4)]">
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-[#8E8E93]">目前總市值</span>
                      <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-[#8E8E93] group-hover:text-white transition-colors">
                        <Activity size={16} />
                      </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-semibold text-white tabular-nums tracking-tight font-mono">
                      {formatCurrency(summary.totalValue)}
                    </p>
                  </div>
                </SpotlightCard>

                <SpotlightCard className="border border-white/[0.08] shadow-[0_8px_30px_rgb(0,0,0,0.4)]">
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-[#8E8E93]">總投資報酬</span>
                      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center border", isOverallPositive ? "bg-emerald-500/10 border-emerald-500/20 text-[#30D158]" : (summary.totalReturn < 0 ? "bg-rose-500/10 border-rose-500/20 text-[#FF453A]" : "bg-white/5 border-white/10 text-[#8E8E93]"))}>
                        {isOverallPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                      </div>
                    </div>
                    <div className="flex items-baseline justify-between flex-wrap gap-2">
                      <p className={cn("text-2xl sm:text-3xl font-semibold tabular-nums tracking-tight font-mono", isOverallPositive ? "text-[#30D158]" : (summary.totalReturn < 0 ? "text-[#FF453A]" : "text-white"))}>
                        {isOverallPositive && summary.totalReturn > 0 ? '+' : ''}{formatCurrency(summary.totalReturn)}
                      </p>
                      <span className={cn("text-xs font-mono font-medium px-2.5 py-0.5 rounded-full border shadow-xs", isOverallPositive ? "bg-emerald-500/15 border-emerald-500/30 text-[#30D158]" : (summary.totalReturnPercent < 0 ? "bg-rose-500/15 border-rose-500/30 text-[#FF453A]" : "bg-white/5 border-white/10 text-[#8E8E93]"))}>
                        {formatPercent(summary.totalReturnPercent)}
                      </span>
                    </div>
                  </div>
                </SpotlightCard>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
                <SpotlightCard className="border border-white/[0.08] shadow-[0_8px_30px_rgb(0,0,0,0.4)]">
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-[#8E8E93]">平倉總成本</span>
                      <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-[#8E8E93] group-hover:text-white transition-colors">
                        <Wallet size={16} />
                      </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-semibold text-white tabular-nums tracking-tight font-mono">
                      {formatCurrency(closedSummary.totalCost)}
                    </p>
                  </div>
                </SpotlightCard>
                
                <SpotlightCard className="border border-white/[0.08] shadow-[0_8px_30px_rgb(0,0,0,0.4)]">
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-[#8E8E93]">已實現總損益</span>
                      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center border", isClosedPositive ? "bg-emerald-500/10 border-emerald-500/20 text-[#30D158]" : (closedSummary.totalRealized < 0 ? "bg-rose-500/10 border-rose-500/20 text-[#FF453A]" : "bg-white/5 border-white/10 text-[#8E8E93]"))}>
                        {isClosedPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                      </div>
                    </div>
                    <div className="flex items-baseline justify-between flex-wrap gap-2">
                      <p className={cn("text-2xl sm:text-3xl font-semibold tabular-nums tracking-tight font-mono", isClosedPositive ? "text-[#30D158]" : (closedSummary.totalRealized < 0 ? "text-[#FF453A]" : "text-white"))}>
                        {isClosedPositive && closedSummary.totalRealized > 0 ? '+' : ''}{formatCurrency(closedSummary.totalRealized)}
                      </p>
                      <span className={cn("text-xs font-mono font-medium px-2.5 py-0.5 rounded-full border shadow-xs", isClosedPositive ? "bg-emerald-500/15 border-emerald-500/30 text-[#30D158]" : (closedSummaryPercent < 0 ? "bg-rose-500/15 border-rose-500/30 text-[#FF453A]" : "bg-white/5 border-white/10 text-[#8E8E93]"))}>
                        {formatPercent(closedSummaryPercent)}
                      </span>
                    </div>
                  </div>
                </SpotlightCard>
              </div>
            )}

            {/* Positions List */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-4 px-1 flex items-baseline gap-3 apple-title">
                {activeTab === 'active' ? '持倉分析' : '歷史績效'}
                <span className="text-xs uppercase tracking-wider text-[#8E8E93] font-normal">
                  {activeTab === 'active' ? 'Position Analysis' : 'Closed Performance'}
                </span>
              </h2>
              
              {activeTab === 'active' ? (
                positions.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="apple-card border-dashed border-white/15 rounded-3xl p-12 text-center relative overflow-hidden"
                  >
                    <div className="w-14 h-14 bg-white/[0.05] text-white rounded-2xl border border-white/10 flex items-center justify-center mx-auto mb-4 shadow-inner">
                      <Activity size={24} className="text-white" />
                    </div>
                    <h3 className="text-white text-lg sm:text-xl mb-1.5 font-semibold tracking-tight apple-title">尚無股票部位</h3>
                    <p className="text-[#8E8E93] text-sm mb-6 max-w-sm mx-auto leading-relaxed">
                      開始新增您的第一筆模擬持倉，輸入台股代號、股數與買進日期來觀察真實歷史投資報酬率。
                    </p>
                    <div className="flex justify-center gap-3 flex-wrap">
                      <motion.button 
                        whileTap={{ scale: 0.97 }}
                        disabled={!activePortfolio || !!pendingAction}
                        onClick={() => setIsModalOpen(true)}
                        className="action-btn text-xs sm:text-sm font-semibold shadow-md flex items-center gap-2"
                      >
                        <Plus size={16} /> 新增模擬部位
                      </motion.button>
                      <button 
                        disabled={!activePortfolio || !!pendingAction}
                        onClick={() => setIsImportOpen(true)}
                        className="action-btn-secondary text-xs sm:text-sm flex items-center gap-1.5"
                      >
                        <FileSpreadsheet size={15} className="text-[#A1A1A6]" />
                        批量匯入持倉
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    <AnimatePresence mode="popLayout">
                      {groupedPositions.map((pos) => (
                        <PositionCard 
                          key={pos.symbol} 
                          position={pos} 
                          quote={quotes[pos.symbol] || quotes[pos.symbol + '.TW'] || quotes[pos.symbol + '.TWO']}
                          onRemove={handleRemovePosition}
                          onSell={(position, currentPrice) => setSellModalData({ position, currentPrice })}
                        />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                )
              ) : (
                closedPositions.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="apple-card border-dashed border-white/15 rounded-3xl p-12 text-center"
                  >
                    <div className="w-14 h-14 bg-white/[0.05] text-white rounded-2xl border border-white/10 flex items-center justify-center mx-auto mb-4 shadow-inner">
                      <Activity size={24} className="text-white" />
                    </div>
                    <h3 className="text-white text-lg sm:text-xl mb-1.5 font-semibold tracking-tight apple-title">尚無平倉紀錄</h3>
                    <p className="text-[#8E8E93] text-sm mb-4 max-w-sm mx-auto leading-relaxed">
                      當您從現有持倉中平倉(賣出)後，損益與已實現報酬紀錄會自動歸檔顯示在此處。
                    </p>
                  </motion.div>
                ) : (
                  <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    <AnimatePresence mode="popLayout">
                      {closedPositions.map((pos) => (
                        <ClosedPositionCard 
                          key={pos.id} 
                          position={pos}
                          onRemove={handleRemoveClosedPosition}
                        />
                      ))}
                    </AnimatePresence>
                  </motion.div>
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
        existingGroups={existingGroups}
        onConfirm={handleCreatePortfolio}
      />

      <PortfolioModal 
        isOpen={isRenameModalOpen}
        onClose={() => {
          setIsRenameModalOpen(false);
          setSelectedRenamePortfolio(null);
        }}
        initialName={selectedRenamePortfolio?.name || ''}
        initialGroupName={selectedRenamePortfolio?.groupName}
        initialGroupCapital={selectedRenamePortfolio?.groupInitialCapital}
        existingGroups={existingGroups}
        onConfirm={handleRenamePortfolio}
      />

      {selectedGroupModal && (
        <GroupModal
          isOpen={!!selectedGroupModal}
          onClose={() => setSelectedGroupModal(null)}
          groupName={selectedGroupModal}
          initialCapital={portfolios.find(p => p.groupName === selectedGroupModal && p.groupInitialCapital !== undefined)?.groupInitialCapital}
          memberPortfolios={portfolios.filter(p => p.groupName === selectedGroupModal)}
          onSaveGroup={handleSaveGroup}
          onDissolveGroup={handleDissolveGroup}
        />
      )}

      {portfolioToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <div className="apple-glass rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 border border-white/10">
            <div className="p-6 space-y-4 text-left">
              <h3 className="text-lg text-white font-semibold tracking-tight apple-title">確認刪除投資組合？</h3>
              <p className="text-sm text-[#8E8E93] leading-relaxed">
                確定要刪除「<span className="text-white font-medium">{portfolioToDelete.name}</span>」嗎？此動作將會永久清除本組合之所有持倉與歷史平倉交易紀錄，且無法復原。
              </p>
              {deleteError && <p role="alert" className="text-sm text-red-300 bg-red-900/20 p-2.5 rounded-xl border border-red-900/50">{deleteError}</p>}
              <div className="flex gap-2.5 pt-2">
                <button 
                  onClick={() => setPortfolioToDelete(null)}
                  disabled={!!pendingAction}
                  className="w-1/2 action-btn-secondary text-sm font-medium"
                >
                  取消
                </button>
                <button 
                  onClick={handleDeletePortfolio}
                  disabled={!!pendingAction}
                  className="w-1/2 px-4 py-2.5 rounded-full bg-rose-500/20 text-[#FF453A] border border-rose-500/30 hover:bg-rose-500/30 transition-colors text-sm font-medium"
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
