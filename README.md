# 📈 如果我當初有買 (How If I Bought) - 台股歷史回測與模擬投資系統

一款優雅、現代化的台股歷史回測與模擬投資組合管理系統。幫助您回顧「如果當初買了這檔股票，現在會怎樣？」的投資假設，並提供多組合橫向比較、雲端同步等功能。

👉 **線上直接體驗：[https://ifiboughtit.vercel.app/](https://ifiboughtit.vercel.app/)**

---

## ✨ 核心特色

1. **台股歷史回測與即時報價**
   - 支援輸入台股代號（自動識別上市與上櫃股票）。
   - 串接即時與歷史報價，精確計算持倉市值、歷史回報與報酬率 (ROI)。
2. **多重投資組合 (Portfolios)**
   - 支援創建多個獨立的投資組合，分類管理您的投資想法。
   - 橫向比較功能：以卡片形式直觀呈現各組合的總成本、總市值與總回報率，並支援**拖拽排序 (Drag & Drop)**。
3. **雲端雙模式同步 (Google Sign-In & Guest Mode)**
   - **訪客模式**：免登入，資料安全地儲存在您的瀏覽器本地端 (LocalStorage)。
   - **Google 登入**：一鍵啟用雲端同步，持倉、平倉紀錄與投資組合跨裝置永久保存（基於 Firebase Authentication 與 Firestore）。
   - **無縫遷移**：登入時自動將訪客模式的本地資料同步至雲端，不丟失任何紀錄。
4. **極致的視覺美學**
   - 奢華質感的深色調 (Dark Mode) 與金銅色系設計。
   - 流暢的微交互動畫與回應式佈局 (Responsive Design)。

---

## 🛠️ 本地開發與部署

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
