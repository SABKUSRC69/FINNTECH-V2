import React, { useState, useEffect, useRef } from 'react'
import Navbar from './components/layout/Navbar'
import Sidebar from './components/layout/Sidebar'
import DashboardView from './components/dashboard/DashboardView'
import TransactionManager from './components/transactions/TransactionManager'
import CalculatorsView from './components/calculators/CalculatorsView'
import PortfolioView from './components/portfolio/PortfolioView'
import QuickActionModal from './components/dashboard/QuickActionModal'
import TradingTerminal from './components/trading/TradingTerminal'
import AnalyticsView from './components/analytics/AnalyticsView'
import ForexNewsView from './components/news/ForexNewsView'
import AuthModal from './components/auth/AuthModal'
import UserProfileModal from './components/auth/UserProfileModal'
import { authService, getLocalDataErrorMessage } from './services/authService'
import { createDemoDataExport } from './services/demoDataExport.js'
import liveMarketService from './services/liveMarketService'
import {
  applyLimitPriceTick,
  applySpotDeposit,
  applySpotOrder,
  applySpotWithdrawal,
  createSpotAccount,
  ZERO_SPOT_BALANCES,
  cancelSpotLimitOrder,
} from './services/spotTradingService'
import { INITIAL_TRANSACTIONS, INITIAL_PORTFOLIO } from './data/initialData'
import {
  INITIAL_SPOT_BALANCES,
  INITIAL_OPEN_ORDERS,
  INITIAL_TRADE_HISTORY,
} from './data/tradingData'

const GUEST_DATA_OWNER = '__guest__'

function safeEmptyUserData() {
  return {
    transactions: [], portfolio: [], balance: 0,
    spotBalances: { ...ZERO_SPOT_BALANCES }, openOrders: [], tradeHistory: [],
    cancelledOrderIds: [], priceAlerts: [], positions: [],
  }
}

export default function App() {
  // Theme State
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('finntech_dark_mode')
      return saved !== null ? JSON.parse(saved) : true // default dark mode
    } catch {
      return true
    }
  })

  // User Authentication State
  const [currentUser, setCurrentUser] = useState(() => authService.getCurrentUser())
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authModalTab, setAuthModalTab] = useState(() => authService.hasUsers() ? 'login' : 'register')
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)

  // Keep the first storage read structured so damaged/unavailable data never
  // becomes an autosaved empty wallet or starter balance.
  const [initialDataLoad] = useState(() => authService.loadUserData(currentUser?.id))
  const initialUserData = initialDataLoad.ok ? initialDataLoad.data : safeEmptyUserData()
  const [dataLoaded, setDataLoaded] = useState(initialDataLoad.ok)
  const [loadedDataOwner, setLoadedDataOwner] = useState(() => (
    initialDataLoad.ok ? (currentUser?.id || GUEST_DATA_OWNER) : null
  ))
  const [persistenceNotice, setPersistenceNotice] = useState(() => (
    initialDataLoad.ok ? '' : getLocalDataErrorMessage(initialDataLoad.status)
  ))
  const activeDataOwner = currentUser?.id || GUEST_DATA_OWNER
  const dataReadyForCurrentOwner = dataLoaded && loadedDataOwner === activeDataOwner

  // Active Navigation Tab (Default to 'trading' for exchange platform experience)
  const [activeTab, setActiveTab] = useState('trading')
  const [activeTradingPair, setActiveTradingPair] = useState('BTC/THB')
  const [marketSnapshot, setMarketSnapshot] = useState(() => liveMarketService.getSnapshot())

  // Quick Action Modal State
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false)

  // Transactions State (User-scoped)
  const [transactions, setTransactions] = useState(() => initialUserData.transactions || [])

  // Portfolio State (User-scoped)
  const [portfolio, setPortfolio] = useState(() => initialUserData.portfolio || [])

  // Spot Asset Balances (THB, BTC, ETH, SOL, USDT, etc.)
  const [spotBalances, setSpotBalances] = useState(() => initialUserData.spotBalances || INITIAL_SPOT_BALANCES)
  const [openOrders, setOpenOrders] = useState(() => initialUserData.openOrders || INITIAL_OPEN_ORDERS)
  const [tradeHistory, setTradeHistory] = useState(() => initialUserData.tradeHistory || INITIAL_TRADE_HISTORY)
  const [priceAlerts, setPriceAlerts] = useState(() => initialUserData.priceAlerts || [])

  const [tradingBalance, setTradingBalance] = useState(() => {
    if (initialUserData.spotBalances?.THB !== undefined) return initialUserData.spotBalances.THB
    return initialUserData.balance !== undefined ? initialUserData.balance : 500000
  })
  const spotAccountRef = useRef(createSpotAccount({
    spotBalances,
    openOrders,
    tradeHistory,
    cancelledOrderIds: initialUserData.cancelledOrderIds || [],
  }))

  // One shared public market feed powers the terminal and all portfolio views.
  useEffect(() => {
    const unsubscribe = liveMarketService.subscribe((_prices, _update, snapshot) => {
      setMarketSnapshot(snapshot)
    })
    liveMarketService.init()
    return unsubscribe
  }, [])

  // Synchronize state when switching users (login / register / logout / switch account)
  useEffect(() => {
    const ownerKey = currentUser?.id || GUEST_DATA_OWNER
    const result = authService.loadUserData(currentUser?.id)
    if (!result.ok) {
      const safeData = safeEmptyUserData()
      setDataLoaded(false)
      setLoadedDataOwner(null)
      setPersistenceNotice(getLocalDataErrorMessage(result.status))
      setTransactions(safeData.transactions)
      setPortfolio(safeData.portfolio)
      setSpotBalances(safeData.spotBalances)
      setOpenOrders(safeData.openOrders)
      setTradeHistory(safeData.tradeHistory)
      setPriceAlerts(safeData.priceAlerts)
      setTradingBalance(0)
      spotAccountRef.current = createSpotAccount(safeData)
      return
    }

    const data = result.data
    setTransactions(data.transactions || [])
    setPortfolio(data.portfolio || [])
    setSpotBalances(data.spotBalances || INITIAL_SPOT_BALANCES)
    setOpenOrders(data.openOrders || INITIAL_OPEN_ORDERS)
    setTradeHistory(data.tradeHistory || INITIAL_TRADE_HISTORY)
    setPriceAlerts(data.priceAlerts || [])
    setTradingBalance(data.spotBalances?.THB ?? data.balance ?? 0)
    spotAccountRef.current = createSpotAccount(data)
    setLoadedDataOwner(ownerKey)
    setDataLoaded(true)
    setPersistenceNotice('')
  }, [currentUser?.id])

  // Synchronize Dark Mode with HTML tag
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    try {
      localStorage.setItem('finntech_dark_mode', JSON.stringify(darkMode))
    } catch {
      // Theme persistence is optional; account data status is reported separately.
    }
  }, [darkMode])

  // Save current user data changes back into user's isolated storage
  useEffect(() => {
    if (!dataReadyForCurrentOwner) return
    const result = authService.saveUserData(currentUser?.id || null, {
      transactions,
      portfolio,
      balance: spotBalances.THB ?? tradingBalance,
      spotBalances,
      openOrders,
      tradeHistory,
      cancelledOrderIds: spotAccountRef.current.cancelledOrderIds,
      priceAlerts,
    }, {
      requireLoadedOwner: true,
      dataLoaded,
      loadedOwnerId: loadedDataOwner,
    })
    if (!result.ok) {
      setPersistenceNotice(getLocalDataErrorMessage(result.status))
    } else if (persistenceNotice) {
      setPersistenceNotice('')
    }
  }, [transactions, portfolio, spotBalances, openOrders, tradeHistory, priceAlerts, currentUser?.id, dataReadyForCurrentOwner, dataLoaded, loadedDataOwner])

  // Handlers
  const handleAddTransaction = (newTx) => {
    setTransactions((prev) => [newTx, ...prev])
  }

  const handleDeleteTransaction = (id) => {
    setTransactions((prev) => prev.filter((tx) => tx.id !== id))
  }

  const handleClearAllTransactions = () => {
    setTransactions([])
    if (currentUser?.id) {
      authService.clearUserTransactions(currentUser.id)
    }
  }

  const handleAddAsset = (newAsset) => {
    setPortfolio((prev) => [newAsset, ...prev])
  }

  const handleUpdateAsset = (updatedAsset) => {
    setPortfolio((prev) => prev.map((asset) => asset.id === updatedAsset.id ? updatedAsset : asset))
  }

  const handleDeleteAsset = (id) => {
    setPortfolio((prev) => prev.filter((item) => item.id !== id))
  }

  const handleClearAllPortfolio = () => {
    setPortfolio([])
    if (currentUser?.id) {
      authService.clearUserPortfolio(currentUser.id)
    }
  }

  // Spot Trading Handlers
  const commitSpotAccount = (account) => {
    spotAccountRef.current = account
    setSpotBalances(account.spotBalances)
    setOpenOrders(account.openOrders)
    setTradeHistory(account.tradeHistory)
    setTradingBalance(account.spotBalances.THB || 0)
  }

  const handleExecuteSpotOrder = (order) => {
    if (!dataReadyForCurrentOwner) return { success: false, error: 'บัญชียังโหลดข้อมูลไม่สำเร็จ จึงปิดการทำรายการไว้' }
    const priceStatus = order.priceStatus || liveMarketService.getSymbolStatus(order.symbol).status
    const result = applySpotOrder(spotAccountRef.current, order, {
      priceStatus,
      pairRules: order.pairRules || liveMarketService.getPairRules(order.symbol),
    })
    if (result.success) commitSpotAccount(result.account)
    return result
  }

  const handleLimitPriceTick = (symbol, price, priceStatus) => {
    if (!dataReadyForCurrentOwner) return { success: false, error: 'บัญชียังโหลดข้อมูลไม่สำเร็จ จึงปิดการจับคู่คำสั่งไว้' }
    const result = applyLimitPriceTick(spotAccountRef.current, symbol, price, priceStatus, {
      pairRules: liveMarketService.getPairRules(symbol),
    })
    if (result.success && result.filledOrders.length > 0) commitSpotAccount(result.account)
    return result
  }

  const handleCancelOpenOrder = (orderId) => {
    if (!dataReadyForCurrentOwner) return { success: false, error: 'บัญชียังโหลดข้อมูลไม่สำเร็จ จึงปิดการยกเลิกคำสั่งไว้' }
    const result = cancelSpotLimitOrder(spotAccountRef.current, orderId)
    if (result.success) commitSpotAccount(result.account)
    return result
  }

  const handleDepositTHB = (amount) => {
    if (!dataReadyForCurrentOwner) return { success: false, error: 'บัญชียังโหลดข้อมูลไม่สำเร็จ จึงปิดการเพิ่มยอดจำลองไว้' }
    const result = applySpotDeposit(spotAccountRef.current, amount)
    if (result.success) commitSpotAccount(result.account)
    return result
  }

  const handleWithdrawTHB = (data) => {
    if (!dataReadyForCurrentOwner) return { success: false, error: 'บัญชียังโหลดข้อมูลไม่สำเร็จ จึงปิดการถอนยอดจำลองไว้' }
    const result = applySpotWithdrawal(spotAccountRef.current, data)
    if (result.success) commitSpotAccount(result.account)
    return result
  }

  const handleResetData = () => {
    if (!dataReadyForCurrentOwner) {
      setPersistenceNotice('ล้างข้อมูลไม่ได้เพราะยังยืนยันไม่ได้ว่าข้อมูลบัญชีโหลดสำเร็จ ต้นฉบับจึงยังไม่ถูกแตะต้อง')
      return false
    }
    let cleanData
    try {
      cleanData = authService.clearUserData(currentUser?.id || null)
    } catch (error) {
      setPersistenceNotice(getLocalDataErrorMessage(error.status || 'write-failed'))
      return false
    }
    setTransactions([])
    setPortfolio([])
    setSpotBalances(cleanData?.spotBalances || { ...ZERO_SPOT_BALANCES })
    setOpenOrders([])
    setTradeHistory([])
    setPriceAlerts([])
    setTradingBalance(cleanData?.balance || 0)
    spotAccountRef.current = createSpotAccount({ spotBalances: cleanData?.spotBalances || ZERO_SPOT_BALANCES })
    setPersistenceNotice('')
    return true
  }

  const handleLoadSampleData = () => {
    if (!dataReadyForCurrentOwner) {
      setPersistenceNotice('โหลดชุดข้อมูลไม่ได้เพราะยังยืนยันไม่ได้ว่าข้อมูลบัญชีโหลดสำเร็จ')
      return false
    }
    if (currentUser?.id) {
      let sample
      try {
        sample = authService.loadSampleData(currentUser.id)
      } catch (error) {
        setPersistenceNotice(getLocalDataErrorMessage(error.status || 'write-failed'))
        return false
      }
      setTransactions(sample.transactions || [])
      setPortfolio(sample.portfolio || [])
      setSpotBalances(sample.spotBalances || INITIAL_SPOT_BALANCES)
      setOpenOrders(sample.openOrders || INITIAL_OPEN_ORDERS)
      setTradeHistory(sample.tradeHistory || INITIAL_TRADE_HISTORY)
      setPriceAlerts(sample.priceAlerts || [])
      setTradingBalance(sample.spotBalances?.THB ?? 500000)
      spotAccountRef.current = createSpotAccount(sample)
      setPersistenceNotice('')
      return true
    }
    return false
  }

  // Auth Handlers
  const handleAuthSuccess = (type, payload) => {
    let user = null
    if (type === 'login') {
      user = authService.login(payload.email, payload.password)
    } else if (type === 'register') {
      user = authService.register(payload.name, payload.email, payload.password)
    } else if (type === 'demo') {
      user = authService.loginDemo()
    }

    if (user) setCurrentUser(user)
  }

  const handleLogout = () => {
    const result = authService.logout()
    if (!result.ok) {
      setPersistenceNotice('ออกจากระบบไม่สำเร็จ เบราว์เซอร์ยังจำบัญชีนี้อยู่และอาจกลับเข้าสู่บัญชีเดิมเมื่อโหลดหน้าใหม่ โปรดลองอีกครั้ง')
      return false
    }
    setCurrentUser(null)
    setDataLoaded(false)
    setLoadedDataOwner(null)
    setTransactions([])
    setPortfolio([])
    setSpotBalances({ ...ZERO_SPOT_BALANCES })
    setOpenOrders([])
    setTradeHistory([])
    setPriceAlerts([])
    setTradingBalance(0)
    spotAccountRef.current = createSpotAccount({
      spotBalances: ZERO_SPOT_BALANCES,
      openOrders: [],
      tradeHistory: [],
    })
    setAuthModalTab('login')
    setIsAuthModalOpen(true)
    setPersistenceNotice('')
    return true
  }

  const handleExportDemoData = (sections) => {
    if (!dataReadyForCurrentOwner) {
      return { ok: false, message: 'ส่งออกไม่ได้เพราะข้อมูลบัญชียังโหลดหรืออ่านไม่สำเร็จ ต้นฉบับยังคงเดิม' }
    }
    try {
      const exportFile = createDemoDataExport({
        transactions,
        portfolio,
        balance: spotBalances.THB ?? tradingBalance,
        spotBalances,
        openOrders,
        tradeHistory,
        cancelledOrderIds: spotAccountRef.current.cancelledOrderIds,
        priceAlerts,
      }, sections, { sourceOrigin: window.location.origin })
      const filename = `finntech-demo-export-${new Date().toISOString().slice(0, 10)}.json`
      const blob = new Blob([JSON.stringify(exportFile, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      return { ok: true, filename }
    } catch {
      return { ok: false, message: 'สร้างไฟล์ส่งออกไม่ได้ เบราว์เซอร์ยังเก็บข้อมูลต้นฉบับไว้' }
    }
  }

  const handleUpdateName = (newName) => {
    if (currentUser) {
      const updated = authService.updateProfile(currentUser.id, { name: newName })
      if (updated) setCurrentUser(updated)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f19] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {persistenceNotice && (
        <div role="alert" className="sticky top-0 z-[60] px-4 py-2 bg-amber-950 text-amber-200 border-b border-amber-700 text-xs text-center">
          {persistenceNotice}
        </div>
      )}
      {/* Top Navigation */}
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        onResetData={handleResetData}
        onLoadSampleData={handleLoadSampleData}
        currentUser={currentUser}
        onOpenAuthModal={() => {
          setAuthModalTab(authService.hasUsers() ? 'login' : 'register')
          setIsAuthModalOpen(true)
        }}
        onOpenProfileModal={() => setIsProfileModalOpen(true)}
      />

      {/* Main Container */}
      <div className={`flex-1 flex w-full mx-auto transition-all duration-300 ${activeTab === 'trading' ? 'max-w-[1680px]' : 'max-w-7xl'}`}>
        {/* Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenQuickAdd={() => setIsQuickAddOpen(true)}
        />

        {/* Dynamic Content View Area */}
        <main className="flex-1 p-3 sm:p-5 lg:p-6 pb-20 md:pb-8 overflow-y-auto">
          {activeTab === 'trading' && (
            <TradingTerminal
              marketSnapshot={marketSnapshot}
              tradingBalance={spotBalances.THB ?? tradingBalance}
              spotBalances={spotBalances}
              openOrders={openOrders}
              tradeHistory={tradeHistory}
              priceAlerts={priceAlerts}
              onPriceAlertsChange={setPriceAlerts}
              onExecuteSpotOrder={handleExecuteSpotOrder}
              onLimitPriceTick={handleLimitPriceTick}
              onCancelOpenOrder={handleCancelOpenOrder}
              onDepositTHB={handleDepositTHB}
              onWithdrawTHB={handleWithdrawTHB}
              onTopUpBalance={() => handleDepositTHB(100000)}
              onNavigateToNews={() => setActiveTab('news')}
              initialSymbol={activeTradingPair}
            />
          )}

          {activeTab === 'news' && (
            <ForexNewsView
              onSelectTradePair={(pairSymbol) => {
                if (pairSymbol) {
                  setActiveTradingPair(pairSymbol)
                }
                setActiveTab('trading')
              }}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView
              tradingBalance={spotBalances.THB ?? tradingBalance}
              tradeHistory={tradeHistory}
            />
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              transactions={transactions}
              portfolio={portfolio}
              spotBalances={spotBalances}
              openOrders={openOrders}
              marketSnapshot={marketSnapshot}
              tradingBalance={spotBalances.THB ?? tradingBalance}
              onNavigateToTransactions={() => setActiveTab('transactions')}
              onOpenQuickAdd={() => setIsQuickAddOpen(true)}
            />
          )}

          {activeTab === 'transactions' && (
            <TransactionManager
              transactions={transactions}
              onAddTransaction={handleAddTransaction}
              onDeleteTransaction={handleDeleteTransaction}
              onClearAllTransactions={handleClearAllTransactions}
              onOpenQuickAdd={() => setIsQuickAddOpen(true)}
            />
          )}

          {activeTab === 'calculators' && <CalculatorsView />}

          {activeTab === 'portfolio' && (
            <PortfolioView
              portfolio={portfolio}
              onAddAsset={handleAddAsset}
              onUpdateAsset={handleUpdateAsset}
              onDeleteAsset={handleDeleteAsset}
              onClearAllPortfolio={handleClearAllPortfolio}
              spotBalances={spotBalances}
              openOrders={openOrders}
              marketSnapshot={marketSnapshot}
            />
          )}
        </main>
      </div>

      {/* Global Quick Record Modal */}
      <QuickActionModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onAddTransaction={handleAddTransaction}
      />

      {/* Authentication Modal (Forced gate if not logged in) */}
      <AuthModal
        isOpen={!currentUser || isAuthModalOpen}
        isForced={!currentUser}
        initialTab={authModalTab}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        currentUser={currentUser}
        balance={spotBalances.THB ?? tradingBalance}
        positionsCount={openOrders.length}
        tradesCount={tradeHistory.length}
        transactionsCount={transactions.length}
        portfolioCount={portfolio.length}
        onUpdateName={handleUpdateName}
        onClearAllData={handleResetData}
        onLoadSampleData={handleLoadSampleData}
        onExportData={handleExportDemoData}
        onLogout={handleLogout}
      />
    </div>
  )
}
