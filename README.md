# Portfolio Dashboard

個人投資 dashboard：一站式查看台股、美股、加密貨幣、現金的現值與未實現損益，統一換算成 TWD。手機優先、深色主題、RWD，可安裝成 PWA。

## 功能

- **總覽**：總資產（TWD）、投資部位未實現損益與報酬率、各類資產佔比
- **分類區塊**：台股 / 美股 / 加密貨幣 / 現金，依現值由大到小排序
  - 手機：精簡兩欄（名稱、現值與報酬率）
  - 平板 / 電腦（`md` 以上）：完整欄位（數量、均價、現價、今日漲跌、現值、損益）
- **標的詳細資訊**：點擊後開啟（手機為底部面板，電腦為置中視窗），顯示成本、現值、損益（原幣與 TWD）、報價來源與時間
- **自動更新**：畫面可見時每 60 秒更新；App 切回前景時立即更新；可手動重新整理
- **隱藏金額**：一鍵遮蔽金額與數量（設定記在裝置上）
- **配色**：台股習慣，紅漲綠跌

## Tech Stack

| 項目 | 選擇 |
|---|---|
| Framework | Vite + React + TypeScript |
| 樣式 | Tailwind CSS v4（`@tailwindcss/vite`） |
| PWA | `vite-plugin-pwa` |
| 資料來源 | Google Sheets `holdings` 分頁（經 Google Apps Script 讀取） |
| 報價 | Yahoo Finance（經 Apps Script 代抓）、OKX 公開 API |
| 部署 | GitHub Pages |

## 架構

```
Google Sheet（私人）── holdings 分頁
        ▲ 讀取
Apps Script Web App（以擁有者身分執行）
  ├─ 驗證 POST body 的 token
  ├─ 讀 holdings
  └─ 抓 Yahoo Finance 報價（台股 / 美股 / 匯率），快取 60 秒
        ▲ ① POST {"token": "..."}
前端（GitHub Pages，靜態網頁）
        │ ② 加密貨幣報價
        ▼
OKX 公開 API（/api/v5/market/ticker，免 key）
```

- 前端全部在瀏覽器執行，沒有自建 server
- Yahoo Finance 不允許瀏覽器直接呼叫（CORS），因此由 Apps Script 在 Google 伺服器端代抓
- OKX 允許瀏覽器直接呼叫，由前端直接查詢

## 專案結構

```
apps_script/Code.gs          Apps Script 後端
scripts/test_api.sh          終端機測試 API（只印代號與價格摘要）
public/                      favicon 與 PWA icon
src/
├── main.tsx                 進入點
├── app.tsx                  登入狀態切換、Dashboard 版面
├── types.ts                 資料型別
├── hooks/
│   └── use_portfolio.ts     載入資料、自動更新、取消過期請求
├── lib/
│   ├── api.ts               呼叫 Apps Script（POST）與 OKX
│   ├── portfolio.ts         損益計算、匯率換算、分類加總
│   ├── format.ts            數字 / 百分比 / 時間格式化
│   └── storage.ts           裝置端設定（API 網址、token、隱藏金額）
└── components/
    ├── lock_screen.tsx      輸入 API 網址與 token
    ├── summary_card.tsx     總資產與資產佔比
    ├── holdings_section.tsx 分類持倉列表（RWD）
    ├── detail_sheet.tsx     標的詳細資訊
    └── section_meta.ts      分類名稱與顏色
```

## 計算方式

| 項目 | 公式 |
|---|---|
| 現值 | `現價 × 數量`（原幣） |
| 成本 | `avg_cost × 數量`（原幣） |
| 未實現損益 | `現值 − 成本`；報酬率 = `損益 / 成本` |
| 今日漲跌 | 股票：`現價 / 前一交易日收盤 − 1`；加密貨幣：`現價 / 台灣時間 00:00 價格 − 1` |
| 換算 TWD | USD 金額 × USD/TWD 匯率 |
| 總資產 | 所有分類（含現金）的 TWD 現值加總 |
| 投資未實現損益 | 台股 + 美股 + 加密貨幣的 TWD 損益加總（不含現金） |

- **報價優先順序**：即時報價（Yahoo / OKX）→ 試算表 `sheet_price` → 無報價（畫面會標示）
- **匯率優先順序**：FX 列的 `avg_cost`（手動覆蓋）→ Yahoo `USDTWD=X` → FX 列的 `sheet_price`
- **限制**：USD 資產的成本以「目前匯率」換算 TWD，所以 TWD 損益不含匯差；USDT 視為 1:1 USD

## 資安設計

| 項目 | 做法 |
|---|---|
| 資產資料 | 只存在私人 Google Sheet；repo 與網站程式碼不含任何資產資料 |
| Token | 存在 Apps Script 的 Script Properties；前端放在 POST body，**不出現在 URL** |
| API 網址與 token | 在登入畫面輸入，只存在該裝置；「登出」會清除 |
| 網址檢查 | 只接受 `https://script.google.com/macros/s/.../exec`，避免 token 被送到其他主機 |
| CSP | 正式版注入 Content-Security-Policy，頁面只能連到自己、Google Apps Script、OKX |
| Referrer | `no-referrer`，不向外部 API 透露來源網址 |
| PWA 快取 | Service worker 只快取程式碼，**不快取 API 回應** |
| 搜尋引擎 | `noindex, nofollow` |
| 第三方套件 | 只用 React、Tailwind、vite-plugin-pwa，沒有分析 / 追蹤 script |

> ⚠️ GitHub Pages 上同一帳號的所有 repo 共用 `eat-apple-again.github.io` 這個 origin，瀏覽器儲存空間是共用的。
> 只要 dashboard 部署在 GitHub Pages，個人頁面 repo **不可加入任何第三方 script**。

## Google Apps Script

[apps_script/Code.gs](apps_script/Code.gs) 部署成 Web App：

- `doPost`：解析 body 的 `token`，與 Script Properties 中的 `API_TOKEN` 比對
- `read_holdings_`：依標題列對應欄位，讀取 `holdings` 分頁
- `fetch_yahoo_quotes_`：`UrlFetchApp.fetchAll` 平行抓 Yahoo chart API，`CacheService` 快取 60 秒
- `doGet`：一律回傳 `use POST`

部署設定：執行身分「我」、存取權「所有人」。修改程式碼後，用「管理部署作業 → 編輯 → 新版本」更新，網址不變。

## Google Sheets `holdings` 分頁

| 欄位 | 說明 |
|---|---|
| `type` | `TW_STOCK` / `US_STOCK` / `CRYPTO` / `CASH` / `FX` |
| `symbol` | 顯示用代號（建議欄位格式設為純文字，保留 `006208` 前導零） |
| `quote_id` | 報價 ID：上市 `2330.TW`、上櫃 `6488.TWO`、美股 `VOO`、加密貨幣 OKX 交易對 `BTC-USDT`、匯率 `USDTWD=X` |
| `name` | 名稱 |
| `quantity` | 股數 / 顆數；`CASH` 填餘額 |
| `avg_cost` | 單位平均成本（以 `currency` 計價，台股建議含手續費）；`FX` 填了就手動覆蓋匯率 |
| `currency` | `TWD` / `USD` |
| `account` | 帳戶 |
| `sheet_price` | 選填，報價備援（可放 `GOOGLEFINANCE` 公式） |
| `note` | 備註 |

## 開發

Node.js 套件裝在專案內的 `node_modules/`（作用等同 Python venv），版本由 `package-lock.json` 鎖定，Node 版本見 `.nvmrc`。

```bash
npm ci          # 安裝套件
npm run dev     # 開發伺服器：http://localhost:5173/portfolio_dashboard/
npm run lint    # 程式碼檢查
npm run build   # 型別檢查 + 打包到 dist/
npm run preview # 預覽正式版（含 CSP 與 service worker）
```
