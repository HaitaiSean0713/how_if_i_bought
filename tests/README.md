# 操作回歸測試

`npm test` 執行資料及錯誤處理測試；`npm run lint` 檢查型別。

瀏覽器測試需要 Playwright 及 Chrome。可先在開發環境安裝 `npm install --no-save playwright`，或將 `PLAYWRIGHT_MODULE` 環境變數設為既有 Playwright 模組的完整路徑。`BROWSER_CHANNEL` 預設為 `chrome`。

```sh
npm run build
node tests/browser-regression.mjs
node tests/guest-regression.mjs
```

登入模式測試使用專用 Firebase 替身，可重現舊文件 ID 不一致、雲端拒絕寫入、延遲回應與空清單等情境，不連線真實帳號。測試建置在 `node_modules/.cache/portfolio-browser-tests`，不修改正式 `dist`。訪客測試使用正式建置。

覆蓋新增、改名、刪除、取消刪除、最後一個組合保護、排序、切換及重新整理、持倉新增／部分賣出／刪除、失敗重試、避免重複送出及避免回灌舊備份。正式 Firebase 權限與部署設定仍需真實環境驗收。
