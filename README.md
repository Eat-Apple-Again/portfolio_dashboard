# Portfolio Dashboard

個人投資 dashboard：一站式查看台股、美股、加密貨幣與各帳戶現金，統一換算成 TWD；可直接在手機上記錄交易與轉帳。手機優先、深色主題、RWD，可安裝成 PWA。

## 功能

三個頁面：**總覽**（dashboard）、**走勢**（每日資產變化）、**試算**（未來資產模擬）。手機為底部分頁列，電腦為標題列分頁；目前頁面記在網址 `#history` 等，重新整理與上一頁都可用。

### 總覽

- **總覽**：總資產（TWD）、投資部位未實現損益與報酬率、各類資產佔比
- **帳戶區塊**（左欄）：每個持倉帳戶（券商、交易所、冷錢包…）一個區塊，順序依 `holdings` 分頁中帳戶第一次出現的順序
  - 區塊內依現值排序列出持倉，下方接著該券商 / 交易所的現金（如券商 USD 現金、交易所 USDT）
  - 窄版：精簡兩欄（名稱、現值與報酬率）；寬版：完整欄位（數量、均價、現價、今日漲跌、現值、損益）
- **帳戶現金**（右欄）：銀行帳戶的實際餘額、待交割金額
- **交割款不足提醒**：待交割扣款大於帳戶餘額時，頁面頂端顯示紅色警告與扣款日
- **記一筆**：
  - 交易：買進 / 賣出 / 股利，記到日期；金額自動計算、可手動修正，預設交割日（台股 T+2）；買進時可直接新增標的
  - 轉帳 / 收支：帳戶間轉帳（支援跨幣別與手續費）、**收入**（薪水、年終：只填轉入帳戶）、**支出**（提領現金：只填轉出帳戶）
- **最近紀錄**：最新 6 筆交易與轉帳
- **標的詳細資訊**：成本、現值、損益（原幣與 TWD）、報價來源與時間
- **版面**：每個區塊可點標題收合（記在裝置上）；零餘額帳戶預設隱藏；電腦版左側帳戶區塊、右側銀行帳戶與紀錄；各區塊依自身寬度（container query）切換精簡 / 表格欄位
- **自動更新**：畫面可見時每 60 秒更新；切回前景時立即更新
- **隱藏金額**：一鍵遮蔽金額與數量
- **配色**：台股習慣，紅漲綠跌

### 走勢

- 從起始日起每一天的總資產，期間可切換 1 / 3 / 6 個月、1 年、全部
- **總額**模式：總資產線 + 淨投入線（期初 + 收入 − 支出），兩線差距即累計市場損益
- **明細**模式：堆疊面積圖，由下而上為自訂銀行分組（如緊急預備金，`accounts.group`）、其他銀行帳戶、各投資帳戶
- 期間統計：期間變化、市場損益、收入 − 支出；各帳戶期初 / 期末 / 變化表；可展開每日數據表
- 圖表可滑動或用方向鍵檢視每日數值；顏色經 CVD / 對比度驗證

### 試算

- 每個帳戶的**歷史年化報酬與波動度**（近 5 / 10 年月資料，依目前持股市值加權），可逐一覆寫「預期報酬」
- 每月投入金額（各投資帳戶 + 現金）、每年額外投入（年終、分紅）與月份、現金年利率、可切換扣除通膨
- **扇形圖**：中位數線 + 25–75%、10–90% 區間 + 累計投入本金線；試算 5 / 10 / 20 / 30 年
- 方法：bootstrap Monte Carlo，每個模擬月份重抽同一個歷史月份套用到所有帳戶（保留波動、肥尾與相關性），再平移使平均報酬等於預期報酬；歷史不足 24 個月的帳戶改用常態分布與預設值。固定亂數種子，2,000 條路徑約 20 ms
- 設定只存在該裝置，登出時清除

### 記一筆的快速備註

試算表 `presets` 分頁（選填）：`kind`（`TRANSFER` / `INCOME` / `EXPENSE` / `ALL`）、`note`。備註可用變數：`{prev_month}`（上個月 `YYYY.MM`）、`{roc_ym}`（民國年月，如 `11510`）、`{rate}`（跨幣別金額換算匯率），以該筆轉帳的日期為準。

## Tech Stack

| 項目 | 選擇 |
|---|---|
| Framework | Vite + React + TypeScript |
| 樣式 | Tailwind CSS v4（`@tailwindcss/vite`） |
| PWA | `vite-plugin-pwa` |
| 資料 | Google Sheets（經 Google Apps Script 讀寫） |
| 報價 | Yahoo Finance（經 Apps Script 代抓）、OKX 公開 API |
| 部署 | GitHub Pages（GitHub Actions） |

## 架構

```
Google Sheet（私人）
  holdings · accounts · trades · transfers
        ▲ 讀取 / 新增
Apps Script Web App（以擁有者身分執行）
  ├─ 驗證 POST body 的 token
  ├─ get：讀四個分頁 + 抓 Yahoo 報價（快取 60 秒）
  └─ add_trade / add_transfer：嚴格驗證後附加一列
        ▲ POST {"token": "...", "action": "..."}
前端（GitHub Pages，靜態網頁）──► OKX 公開 API（加密貨幣報價）
```

## 資料模型：期初 + 異動

以「起始日」的狀態為期初，之後的變化由 `trades`、`transfers` 推算。起始日之前的舊流水分頁（IBKR、國泰證券、OKX、BitoPro…）保留封存，程式不讀取。

```
目前持倉 = holdings（期初持倉）  + 起始日後的 trades
帳戶餘額 = accounts（期初餘額）  + 起始日後的 transfers + 已交割的 trades
```

### 計算規則

| 項目 | 規則 |
|---|---|
| 交割帳戶 | 由 `accounts.broker` 固定對應，App 與 Apps Script 都依此決定，不可手動選擇 |
| 起始日 | 每筆 trade 以其 `cash_account` 的 `opening_date` 為準 |
| 持倉變動時點 | **成交日**（`trade_date`）。成交日早於起始日的交易視為已包含在 `holdings` |
| 現金變動時點 | **交割日**（`settle_date`）自動扣款 / 入帳，不需手動記錄。交割日在未來者列為「待交割」 |
| 交割款不足 | 「可用」（餘額 + 待交割）小於 0 時提醒，日期為最早的待交割扣款日 |
| 平均成本 | 移動平均：買進時 `新成本 = 原成本 + 實付金額`；賣出時均價不變 |
| 實付 / 實收金額 | 買進 `數量×價格+手續費+稅`；賣出 `數量×價格−手續費−稅`；可手動改成券商實際金額 |
| 轉帳 | 轉出帳戶 `−(amount + fee)`；轉入帳戶 `+to_amount`（同幣別未填時 = amount）。`from_account` 空白 = 收入、`to_account` 空白 = 支出 |
| 每日走勢 | 對起始日後的每一天重播「期初 + 當天以前的異動」，以當天收盤價（休市沿用前一交易日）與當天匯率估值；今天的點直接用總覽的即時數字 |
| 市場損益 | `期間變化 − (收入 − 支出)`；帳戶間轉帳不影響 |
| 總資產 | 持倉現值 + 各帳戶「可用」金額（= 餘額 + 待交割），避免與已入帳持股重複計算 |
| 今日漲跌 | 股票：相對前一交易日收盤；加密貨幣：相對台灣時間 00:00 |
| 報價 | 即時報價 → `sheet_price` → 無報價（畫面標示） |
| 匯率 | FX 列 `avg_cost`（手動）→ Yahoo `USDTWD=X` → FX 列 `sheet_price` |

**限制**：USD 資產的 TWD 損益以目前匯率換算（不含匯差）；USDT 視為 1:1 USD；T+2 只跳過週末，國定假日需手動修改交割日。

## Google Sheets 分頁

### `holdings`（期初持倉）
| 欄位 | 說明 |
|---|---|
| `type` | `TW_STOCK` / `US_STOCK` / `CRYPTO` / `FX` |
| `symbol` | 代號（建議欄位設為純文字，保留 `006208` 前導零） |
| `quote_id` | 報價 ID：上市 `2330.TW`、上櫃 `6488.TWO`、美股 `VOO`、加密貨幣 `BTC-USDT`、匯率 `USDTWD=X` |
| `name` | 名稱 |
| `quantity` / `avg_cost` | 起始日的數量與平均成本（以 `currency` 計價）；`FX` 的 `avg_cost` 填了就手動覆蓋匯率 |
| `currency` | `TWD` / `USD` |
| `account` | 持倉所在帳戶（國泰證券、IBKR、OKX…） |
| `sheet_price` | 選填，報價備援 |
| `note` | 備註 |

新標的：在「記一筆 → 買進 → ＋ 新增標的」輸入，App 會自動在 `holdings` 新增一列（數量 0）再寫入交易。

### `accounts`（期初現金）
| 欄位 | 說明 |
|---|---|
| `account` | 帳戶名稱 |
| `type` | `BANK` / `BROKER` / `EXCHANGE`。`BROKER` / `EXCHANGE` 的現金顯示在對應帳戶區塊內，`BANK` 顯示在右欄 |
| `currency` | `TWD` / `USD`（USDT 視為 USD） |
| `opening_balance` | 起始日餘額 |
| `opening_date` | 起始日（日期格式，例如 `2026-10-20`） |
| `group` | 選填。銀行帳戶在走勢圖「明細」的分組（例如 `緊急預備金`），自訂分組疊在最下層 |
| `broker` | 選填。此帳戶是哪個券商的**固定交割帳戶**，值須與 `holdings.account` 相同（例如台股交割戶填台股券商的帳戶名稱）。未設定時，以與券商同名的帳戶交割 |
| `note` | 備註 |

### `trades`（由 App 寫入）
`id`, `trade_date`, `account`, `action`（`BUY`/`SELL`/`DIVIDEND`）, `symbol`, `quantity`, `price`, `fee`, `tax`, `amount`, `cash_account`, `settle_date`, `note`, `created_at`

### `transfers`（由 App 寫入）
`id`, `datetime`, `from_account`, `to_account`, `amount`, `to_amount`, `fee`, `note`, `created_at`

欄位依標題名稱對應，順序可調整。修正或刪除紀錄請直接在試算表操作（API 只能新增）。

## 專案結構

```
.github/workflows/deploy_pages.yml  GitHub Pages 自動部署
apps_script/Code.gs                 Apps Script 後端（讀取、報價、寫入驗證）
scripts/test_api.sh                 終端機測試 API（只印摘要）
public/                             favicon 與 PWA icon
src/
├── main.tsx / app.tsx              進入點、版面
├── types.ts                        資料型別
├── hooks/use_portfolio.ts          載入資料、自動更新、取消過期請求
├── hooks/use_history.ts            開啟走勢 / 試算頁時才抓日 / 月歷史價格
├── lib/
│   ├── api.ts                      Apps Script（get / add_trade / add_transfer / history）與 OKX（即時、日 K）
│   ├── portfolio.ts                replay（期初 + 異動）、移動平均、交割、帳戶分組
│   ├── history.ts                  每日重播 + 歷史收盤價估值、圖表分組
│   ├── forecast.ts                 月報酬統計、bootstrap Monte Carlo
│   ├── presets.ts                  快速備註的變數展開
│   ├── dates.ts                    YYYYMMDD HHMMSS 解析、T+2 營業日
│   ├── format.ts                   數字 / 百分比 / 時間格式化
│   └── storage.ts                  裝置端設定
└── components/
    ├── lock_screen.tsx             輸入 API 網址與 token
    ├── summary_card.tsx            總資產與資產佔比
    ├── group_section.tsx           帳戶區塊：持倉 + 券商現金（RWD）
    ├── accounts_section.tsx        銀行帳戶現金與待交割
    ├── history_view.tsx            走勢頁：期間、統計、圖表、表格
    ├── history_chart.tsx           SVG 走勢圖（總額 / 堆疊、十字線提示）
    ├── forecast_view.tsx           試算頁：假設輸入、統計、帳戶表
    ├── forecast_chart.tsx          SVG 扇形圖
    ├── recent_records.tsx          最近紀錄
    ├── detail_sheet.tsx            標的詳細資訊
    ├── entry_sheet.tsx             記一筆（交易 / 轉帳分頁）
    ├── trade_form.tsx              交易表單
    ├── transfer_form.tsx           轉帳表單
    ├── form_fields.tsx             表單元件
    ├── section_card.tsx            可收合的區塊外框
    └── section_meta.ts             分類名稱與顏色
```

## 資安設計

| 項目 | 做法 |
|---|---|
| 資產資料 | 只存在私人 Google Sheet；repo 與網站程式碼不含任何資產資料 |
| Token | 存在 Apps Script 的 Script Properties；前端放在 POST body，**不出現在 URL** |
| API 網址與 token | 在登入畫面輸入，只存在該裝置；「登出」會清除（含帳戶偏好設定） |
| 網址檢查 | 只接受 `https://script.google.com/macros/s/.../exec`，避免 token 被送到其他主機 |
| 寫入 API | **只能新增**，不能修改或刪除；欄位逐一驗證（日期、列舉、數值範圍、帳戶與標的必須存在） |
| 公式注入 | 文字欄位以白名單比對；備註若以 `= + - @` 開頭會加上 `'` 存成純文字；文字儲存格設為純文字格式（保留 `006208` 前導零） |
| 重複送出 | 每筆附 UUID，伺服器拒絕重複 id；寫入時 `LockService` 鎖定 |
| CSP | 正式版頁面只能連到自己、Google Apps Script、OKX |
| Referrer / 搜尋引擎 | `no-referrer`、`noindex, nofollow` |
| PWA 快取 | Service worker 只快取程式碼，**不快取 API 回應** |
| 第三方套件 | 只用 React、Tailwind、vite-plugin-pwa |

> ⚠️ GitHub Pages 上同一帳號的所有 repo 共用 `eat-apple-again.github.io` 這個 origin。
> 只要 dashboard 部署在 GitHub Pages，個人頁面 repo **不可加入任何第三方 script**。

## Google Apps Script

[apps_script/Code.gs](apps_script/Code.gs) 部署成 Web App（執行身分「我」、存取權「所有人」）。修改後用「管理部署作業 → 編輯 → 新版本」更新，網址不變。

| action | 說明 |
|---|---|
| `get`（預設） | 回傳 holdings、accounts、trades、transfers 與 Yahoo 報價 |
| `add_trade` | 驗證後附加到 `trades`；附 `new_holding` 時先在 `holdings` 新增數量 0 的一列 |
| `add_transfer` | 驗證後附加到 `transfers`（跨幣別必填 `to_amount`；可只填一側作為收入 / 支出） |
| `history` | 回傳 `start` 起每個 Yahoo 報價標的的收盤價，`interval` 為 `1d` 或 `1mo`（快取 6 小時） |

## 開發

Node.js 套件裝在專案內的 `node_modules/`（作用等同 Python venv），版本由 `package-lock.json` 鎖定，Node 版本見 `.nvmrc`。

```bash
npm ci          # 安裝套件
npm run dev     # 開發伺服器：http://localhost:5173/portfolio_dashboard/
npm run lint    # 程式碼檢查
npm run build   # 型別檢查 + 打包到 dist/
npm run preview # 預覽正式版（含 CSP 與 service worker）
```

## 部署

[.github/workflows/deploy_pages.yml](.github/workflows/deploy_pages.yml)：push 到 `main` 後自動 `npm ci` → `lint` → `build`，並把 `dist/` 發布到 GitHub Pages。

- 網址：https://eat-apple-again.github.io/portfolio_dashboard/
- 首次設定：repo **Settings → Pages → Source 選「GitHub Actions」**
- 權限最小化：workflow 只有讀取程式碼與發布 Pages 的權限
