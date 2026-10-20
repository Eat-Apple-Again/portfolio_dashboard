# Portfolio Dashboard

個人投資 dashboard：一站式查看台股、美股、加密貨幣、銀行現金的現值與未實現盈虧（統一換算成 TWD）。

> 🚧 開發中。本文件會隨進度補上完整實作說明。

## Tech Stack

| 項目 | 選擇 |
|---|---|
| Framework | Vite + React + TypeScript |
| 樣式 | Tailwind CSS v4（`@tailwindcss/vite`） |
| 資料來源 | Google Sheets `holdings` 分頁（經 Google Apps Script 讀取） |
| 報價 | Yahoo Finance（經 Apps Script 代理）、CoinGecko |
| 部署 | GitHub Pages（PWA，可加入 iPhone / iPad 主畫面） |

## 開發環境

Node.js 專案的套件都裝在專案自己的 `node_modules/` 裡，不會污染全域，作用就跟 Python 的 venv 一樣。版本由 `package-lock.json` 鎖定，Node 版本記錄在 `.nvmrc`。

```bash
npm ci        # 依 package-lock.json 安裝套件
npm run dev   # 開發伺服器
npm run build # 打包到 dist/
```

## 隱私設計

- Repo 和網站介面是公開的，**程式碼裡不含任何資產資料或金鑰**
- 資產資料留在私人的 Google Sheet，只能透過 Apps Script 加上 secret token 讀取
- Apps Script URL 和 token 在 App 的設定頁輸入，只存在你自己的裝置上

## Google Apps Script

[apps_script/Code.gs](apps_script/Code.gs) 部署成 Web App，作為免費的資料中介層：

- 以 POST body `{"token": "..."}` 驗證，比對 Script Properties 中的 `API_TOKEN`（token 不出現在 URL）
- 讀取 `holdings` 分頁，回傳 JSON
- 用 `UrlFetchApp.fetchAll` 平行抓 Yahoo Finance 報價（伺服器端沒有 CORS 限制），`CacheService` 快取 60 秒

部署設定：執行身分「我」、存取權「所有人」（沒有 token 只會拿到 `unauthorized`）。

## Google Sheets `holdings` 分頁

| 欄位 | 說明 |
|---|---|
| `type` | `TW_STOCK` / `US_STOCK` / `CRYPTO` / `CASH` / `FX` |
| `symbol` | 顯示用代號 |
| `quote_id` | 報價 ID：上市 `2330.TW`、上櫃 `6488.TWO`、美股 `VOO`、CoinGecko id `bitcoin` |
| `name` | 名稱 |
| `quantity` | 股數 / 顆數；`CASH` 填餘額 |
| `avg_cost` | 單位平均成本（以 `currency` 計價，台股建議含手續費）；`FX` 填了就手動覆蓋匯率 |
| `currency` | `TWD` / `USD` |
| `account` | 帳戶（國泰證券、IBKR、OKX…） |
| `sheet_price` | 選填，可放試算表公式算出的報價，API 抓不到時當備援 |
| `note` | 備註 |
