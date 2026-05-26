import React, { useState, useEffect } from 'react';
import { Plus, Wallet, TrendingUp, TrendingDown, Activity, RefreshCw, LayoutGrid, Trash2, LogOut, LogIn } from 'lucide-react';
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

  const [activePortfolioId, setActivePortfolioId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'active' | 'closed' | 'compare'>('active');
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sellModalData, setSellModalData] = useState<{ position: Position, currentPrice?: number } | null>(null);
  const [isPortfolioModalOpen, setIsPortfolioModalOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setPortfolios([]);
        setIsLoadingPortfolios(false);
      }
    });
    return () => unsubscribe();
  }, []);

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
        const defaultPort: Portfolio = {
          id: crypto.randomUUID(),
          name: '預設組合',
          positions: [],
          closedPositions: [],
          userId: user.uid,
          createdAt: Date.now()
        };
        handleCreatePortfolioInDB(defaultPort);
      } else {
        setPortfolios(loadedPortfolios);
        setActivePortfolioId(prev => loadedPortfolios.some(p => p.id === prev) ? prev : loadedPortfolios[0].id);
      }
      setIsLoadingPortfolios(false);
    }, (error) => {
      setIsLoadingPortfolios(false);
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
    try {
      await setDoc(doc(db, 'portfolios', updated.id), { ...updated, updatedAt: Date.now() }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'portfolios/' + updated.id);
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

  const updateActivePortfolio = (updater: (p: Portfolio) => Portfolio) => {
    const current = portfolios.find(p => p.id === activePortfolioId);
    if (current) {
        syncActivePortfolio(updater(current));
    }
  };

  const activePortfolio = portfolios.find(p => p.id === activePortfolioId) || portfolios[0];
  const positions = activePortfolio?.positions || [];
  const closedPositions = activePortfolio?.closedPositions || [];

  const handleAddPosition = async (newPos: Omit<Position, 'id' | 'totalCost'>) => {
    const position: Position = {
      ...newPos,
      id: crypto.randomUUID(),
      totalCost: newPos.buyPrice * newPos.shares,
    };
    updateActivePortfolio(p => ({ ...p, positions: [...p.positions, position] }));
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
      sellDate,
      sellPrice,
      realizedReturn,
      realizedReturnPercent,
    };

    updateActivePortfolio(p => ({
      ...p,
      closedPositions: [closedPos, ...p.closedPositions],
      positions: p.positions.filter(pos => pos.id !== position.id)
    }));
    setSellModalData(null);
  };

  const handleCreatePortfolio = async (name: string) => {
    if (!user) return;
    const newPort: Portfolio = { 
      id: crypto.randomUUID(), 
      name, 
      positions: [], 
      closedPositions: [],
      userId: user.uid,
      createdAt: Date.now()
    };
    await handleCreatePortfolioInDB(newPort);
    setActivePortfolioId(newPort.id);
    setActiveTab('active');
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
             ) : (
                <button onClick={loginWithGoogle} className="flex items-center gap-2 px-4 py-2 border border-[#C5A059] rounded text-[#C5A059] hover:bg-[#C5A059] hover:text-black transition-colors text-sm font-medium">
                  <LogIn size={16} /> Google 登入
                </button>
             )}
          </div>
        </header>

        {!user ? (
           <div className="h-[50vh] flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-[#1C1C1F] text-[#C5A059] rounded-full border border-[#333333] flex items-center justify-center mx-auto mb-6">
                <Wallet size={24} />
              </div>
              <h2 className="text-2xl font-serif text-[#E5E7EB] mb-2">雲端同步投資組合</h2>
              <p className="text-[#6B7280] max-w-md mb-8">
                登入您的 Google 帳戶以啟動您的雲端模擬投資組合。您的持倉、績效和操作紀錄將自動同步並永久儲存。
              </p>
              <button 
                onClick={loginWithGoogle}
                className="gold-text border border-[#C5A059] hover:bg-[#C5A059] hover:text-[#0A0A0C] transition-colors rounded px-8 py-3 text-sm font-bold uppercase tracking-widest flex items-center gap-2"
              >
                 <LogIn size={18} />
                 立即登入 / 註冊
              </button>
           </div>
        ) : (
          <>
            {/* Portfolios Navigation */}
        <div className="flex gap-3 mb-8 overflow-x-auto pb-2 border-b border-[#222226] scrollbar-hide items-center">
          {portfolios.map(p => (
            <button 
              key={p.id}
              onClick={() => { setActivePortfolioId(p.id); if(activeTab === 'compare') setActiveTab('active'); }}
              className={cn("px-4 py-2 rounded-t-lg border-b-2 text-sm flex-shrink-0 transition-colors bg-[#0A0A0C] hover:bg-[#141417]", 
                activePortfolioId === p.id && activeTab !== 'compare' 
                  ? "border-[#C5A059] text-[#C5A059]" 
                  : "border-transparent text-[#6B7280]"
              )}
            >
              {p.name}
            </button>
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
                 <div key={p.id} className="card-bg rounded-lg p-6 relative group border border-[#222226]">
                    <div className="flex justify-between items-start mb-6">
                      <h3 className="text-xl serif gold-text font-medium">{p.name}</h3>
                      {portfolios.length > 1 && (
                        <button 
                          onClick={() => handleDeletePortfolio(p.id)} 
                          className="text-[#6B7280] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                          title="刪除組合"
                        >
                          <Trash2 size={16}/>
                        </button>
                      )}
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
                    {positions.map((pos) => (
                      <PositionCard 
                        key={pos.id} 
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
    </div>
  );
}

export default App;
