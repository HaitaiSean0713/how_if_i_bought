# 📈 如果我當初有買 (How If I Bought) - 台股歷史回測與模擬投資系統

一款專為台股投資人設計的歷史回測 (Backtesting) 與模擬投資組合 (Portfolio) 管理系統。
它能幫你快速解答：「如果我當初在某個時間點，以某個價格買了這檔股票，現在的資產會變怎樣？」不再需要手動拉 Excel 歷史股價，用最直覺、優雅的方式驗證你的投資直覺。

**線上直接體驗：[https://ifiboughtit.vercel.app/](https://ifiboughtit.vercel.app/)**

---

## 💡 為什麼你需要這個系統？（解決投資痛點）

*   **免除繁瑣的手動計算**：想知道三年前買進台積電 (2330) 抱到現在的報酬率？輸入代號與日期，系統自動串接歷史與即時報價，一秒算出市值與報酬率 (ROI)。
*   **多種策略橫向比較**：想比較「高股息 ETF」與「半導體飆股」的績效差異？建立多個獨立投資組合，利用卡片式設計直觀對比總成本、市值與回報率。
*   **靈活的資料管理**：不需繁複註冊即可開始使用；當決定長期記錄時，一鍵綁定 Google 帳號即可無縫將本地資料同步至雲端。

---

## ✨ 核心實用功能解析

### 1. ⚡ 精確的台股歷史回測 (Backtesting)
*   **自動識別上市/上櫃**：只需輸入台股代號（如 `2330` 或 `0050`），系統自動抓取對應的股票資訊。
*   **損益即時試算**：支援自訂買入日期、買入價格（股價）及股數，自動結合歷史報價與當前即時報價，精確計算出持倉市值、歷史回報與投資報酬率 (Return on Investment, ROI)。

### 2. 🗂️ 多重投資組合與直觀比較 (Multi-Portfolio Management)
*   **主題分類管理**：可依據不同的投資策略（例如：價值投資、動態避險、定期定額）建立多個獨立的投資組合。
*   **橫向看板對比**：以卡片形式直觀呈現各組合的「總成本」、「總市值」與「總回報率」，一眼看出哪種策略表現最佳。
*   **拖拽排序 (Drag & Drop)**：自由拖曳調整投資組合的排列順序，讓最關注的策略永遠排在最前面。

### 3. ☁️ 雲端雙模式無縫同步 (Hybrid Storage & Sync)
*   **訪客模式 (Guest Mode)**：免登入、免註冊！所有操作資料皆安全地儲存於瀏覽器的本地端儲存空間 (LocalStorage)，保障個人隱私。
*   **雲端同步 (Google Sign-In)**：一鍵透過 Google 帳號登入，資料便會與 Firebase 雲端資料庫同步，實現跨裝置（手機、平板、電腦）同步讀取與永久保存。
*   **無痛轉移 (Seamless Migration)**：登入時，系統會自動偵測並將您在「訪客模式」下建立的本地資料同步至雲端，確保過往的模擬紀錄不會遺失。

### 4. 🎨 極致奢華的視覺體驗 (Premium Dark UI)
*   **夜貓子友善設計**：採用精緻的深色調 (Dark Mode) 與金銅色系搭配，在低光源下使用也極其舒適。
*   **動態微交互 (Micro-interactions)**：流暢的動畫與響應式網頁設計 (Responsive Web Design)，不論在桌機還是手機上，都擁有如原生 App 般的流暢操作體驗。

---

## 📖 實用情境與操作指南 (User Scenarios & Guide)

### 💡 情境一：我想測試「三年前買 1 張台積電」抱到現在的報酬率
1.  **建立組合**：點選「新增投資組合」，命名為 `護國神山試驗`。
2.  **加入持倉**：
    *   在該組合下點擊「新增股票」。
    *   輸入股票代號 `2330`（系統會自動顯示「台積電」）。
    *   輸入三年前的「買入日期」、「買入價格」與股數 `1000`（1張）。
    *   點擊「確認送出」。
3.  **查看結果**：系統立即計算出**當時總花費**、**目前市值**與**累積回報率 (ROI)**，並會隨盤中股價即時跳動。

### 💡 情境二：我想橫向對比「定期定額 ETF」與「科技飆股」的績效
1.  **分類管理**：建立兩個組合，分別命名為 `0050/00878 穩健組` 與 `半導體概念飆股組`。
2.  **分別記錄**：在各自的組合中，新增對應的股票買入紀錄。
3.  **橫向對比**：回到主儀表板 (Dashboard)，您可以直接並排看到兩張卡片，對比他們的「總回報率」，並可透過**滑鼠拖拽**將表現較佳或較關注的組合移至最左側。

### 💡 情境三：我用手機模擬了幾筆紀錄，想換到平板看，且不希望紀錄遺失
1.  **本地使用**：在手機上直接打開網頁，此時為**訪客模式 (Guest Mode)**。
2.  **一鍵綁定**：點擊右上角的「Google 登入」。
3.  **無痛移轉**：登入完成後，系統會詢問並**自動將您剛才在手機上建立的所有持倉資料上傳雲端**。
4.  **跨裝置同步**：在平板上打開同網頁並登入同一個 Google 帳號，所有模擬數據即刻同步呈現。

---

## ⚙️ 技術架構與資料流 (Architecture & Data Flow)

*   **前端框架 (Frontend)**：React / Vite / TypeScript，確保介面渲染極速流暢。
*   **樣式與動畫 (Styling)**：客製化 CSS 系統，打造高質感的深色奢華微光視覺。
*   **後端 API (Backend)**：使用 Vercel Serverless Functions 部署 `/api/quotes` API，負責抓取與快取台股歷史/即時報價，減少對第三方服務的請求負擔。
*   **雲端服務 (Cloud Services)**：基於 Firebase Auth 進行身分驗證，並使用 Firestore 進行多端實時資料庫 (Real-time Database) 同步。

---

## 🛠️ 本地開發與部署 (Local Development & Deployment)


### 1. 環境需求
- [Node.js](https://nodejs.org/) (建議 v18 以上)
- [Firebase 專案](https://console.firebase.google.com/) (選填，僅雲端同步需要)

### 2. 安裝與啟動
1. 複製並命名環境變數檔案：
   ```bash
   cp .env.example .env.local
   ```
2. 安裝套件：
   ```bash
   npm install
   ```
3. 啟動開發伺服器：
   ```bash
   npm run dev
   ```

### 3. Firebase 雲端同步設定 (選填)
若您想要本地執行並使用 Google 登入功能，請在 `.env.local` 填入您的 Firebase 設定：
```env
VITE_FIREBASE_API_KEY="您的_API_KEY"
VITE_FIREBASE_AUTH_DOMAIN="您的_AUTH_DOMAIN"
VITE_FIREBASE_PROJECT_ID="您的_PROJECT_ID"
VITE_FIREBASE_STORAGE_BUCKET="您的_STORAGE_BUCKET"
VITE_FIREBASE_MESSAGING_SENDER_ID="您的_MESSAGING_SENDER_ID"
VITE_FIREBASE_APP_ID="您的_APP_ID"
VITE_FIREBASE_FIRESTORE_DATABASE_ID="" # 預設留空使用 (default) 資料庫
```

> 💡 **Firebase Console 必要設定：**
> 1. 前往 **Authentication** -> **Sign-in method** -> 啟用 **Google** 登入。
> 2. 前往 **Authentication** -> **Settings** -> **Authorized domains** -> 將您的本機網域 `localhost`（或部署網域）加入授權清單。
> 3. 前往 **Firestore Database** -> 建立資料庫，並設定對應的安全性規則（請參考專案中的 `firestore.rules` 檔案）。

---

## 🚀 部署至 Vercel

本專案已針對 Vercel 進行最佳化（包含 `/api/quotes` API 路由）。可以直接點擊下方按鈕一鍵部署，並在 Vercel 專案設定中加入上述 Firebase 環境變數。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/HaitaiSean0713/how_if_i_bought)
