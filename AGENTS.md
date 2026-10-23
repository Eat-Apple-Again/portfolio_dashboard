# AGENTS.md

給協助使用者操作這個 repo 的 AI agent。概念與功能說明見 [README.md](README.md)；本文件是**規則、流程與規格**。

**優先順序：資安規則 > 使用者指示 > 其他目標。** 使用者的資產資料、token、Web App 網址都是機密。

---

## 1. 資安規則 (必須遵守)

| # | 規則 |
|---|---|
| S1 | **資產資料不進 repo。** 帳戶名稱、餘額、持股、交易只存在使用者的 Google Sheet。程式碼、文件、測試、commit message 的範例一律用虛構資料 (如 `銀行A`、`券商_台股`) |
| S2 | **不要請使用者在對話中貼上 token 或 Web App 網址。** 這兩者只會出現在：Apps Script 的指令碼屬性、使用者的密碼管理器、dashboard 登入畫面、`scripts/test_api.sh` 的互動輸入 |
| S3 | **Token 不得出現在** URL query string、檔案、shell 指令參數、shell history、log。需要呼叫 API 時沿用 [scripts/test_api.sh](scripts/test_api.sh) 的做法：`read -s` 讀取、經 stdin 傳給 curl、結束時 `unset` |
| S4 | **截圖前先提醒遮蔽。** 請使用者截圖時，金額欄可遮住或先用假資料；**絕不可**包含 token 值、Web App 網址 (`/macros/s/<部署 ID>/exec`)、指令碼屬性的值。dashboard 截圖請先按右上角「隱藏」。要放進公開文件的截圖，只能用填了**示範資料**的另一份試算表 |
| S5 | **意外外洩時立即輪替。** 若 token 出現在截圖、對話或任何檔案中：請使用者到「專案設定 → 指令碼屬性」把 `API_TOKEN` 改成新值 (立即生效，不需重新部署)，再到各裝置登出後重新登入 |
| S6 | 不要印出 API 回應的完整內容，只摘要筆數或使用者指定的欄位 |
| S7 | 寫入 API 只能新增；修改或刪除由使用者在試算表手動操作，不要嘗試繞過 |
| S8 | 不要新增執行期的第三方 script 或外部連線。新的 origin 必須加到 [vite.config.ts](vite.config.ts) 的 CSP `connect-src`，並先徵得使用者同意 |
| S9 | 同一 GitHub 帳號的 Pages 網站共用 `<帳號>.github.io` origin。提醒使用者：該帳號的其他 Pages 網站不可加入第三方 script |

---

## 2. 引導設定流程

依序進行，**每一步通過驗收才進下一步**。每步格式：目標 → 使用者操作 → 驗收 (要什麼截圖、檢查什麼)→ 常見錯誤。

### Step 1：訪談並規劃帳戶

**目標**：產出 `accounts` 與 `holdings` 的列 (只有名稱與屬性，**不需要金額**)。

**詢問使用者：**
- [ ] 有哪些持股帳戶：台股券商、美股券商 (複委託或海外券商)、加密貨幣交易所、冷錢包
- [ ] 每個券商的交割款從哪個銀行帳戶扣
- [ ] 有哪些銀行帳戶、各自用途：日常、緊急預備金、等待投入、信用卡扣款…
- [ ] 一個帳戶是否有多種用途 (是 → 拆成虛擬帳戶，見 README「規劃帳戶」)
- [ ] 起始日 (建議用最近一個所有帳戶都對得上帳的日子)

**決策規則：**

| 帳戶性質 | `type` | `broker` | `group` |
|---|---|---|---|
| 券商 / 交易所內的現金 | `BROKER` / `EXCHANGE` | 空白 (帳戶名稱與 `holdings.account` 相同) 或填持股帳戶名稱 | 空白 |
| 某券商的交割銀行帳戶 | `BANK` | 該持股帳戶名稱 (每個持股帳戶只能有一個) | 空白 |
| 等著投入某部位的錢 | `BANK` | 空白 | 該持股帳戶名稱 |
| 尚未決定用途的投資儲備 | `BANK` | 空白 | 儲備名稱，如 `總儲備` |
| 日常、緊急預備金、卡費 | `BANK` | 空白 | 空白 |

**產出**：兩份 Tab 分隔文字 (含標題列，金額欄留空) 讓使用者貼上；不要存成檔案。

### Step 2：Fork 與 GitHub Pages

**使用者操作：**
1. repo 右上角 **Fork** → Create fork
2. repo 名稱若不是 `portfolio_dashboard`，修改 [vite.config.ts](vite.config.ts) 的 `base` 為 `/<repo 名稱>/` 並 commit
3. **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**
4. **Actions** 分頁 → 「I understand my workflows, go ahead and enable them」 (fork 預設停用 Actions)
5. 左側 **Deploy to GitHub Pages** → **Run workflow** → Branch: `main` → Run workflow

**驗收截圖**：
- Settings → Pages 畫面
  - [ ] Source 顯示「GitHub Actions」
- Actions 分頁的 workflow run
  - [ ] build、deploy 都是綠勾
  - [ ] 開啟 `https://<帳號>.github.io/<repo>/` 會看到登入畫面

**常見錯誤：**

| 狀況 | 原因 |
|---|---|
| 網站 404 | Source 不是 GitHub Actions，或 workflow 還沒跑完 |
| 網站空白、console 顯示 JS 404 | `vite.config.ts` 的 `base` 與 repo 名稱不符 |
| deploy 步驟失敗：`Get Pages site failed` | 尚未在 Settings → Pages 選 GitHub Actions |

### Step 3：建立試算表與分頁

**使用者操作**：建立新的 Google 試算表 (私人，不要共用)，建立分頁並貼上標題列 (見 §4 Sheet schema)。

**驗收截圖**：每個分頁的第 1 列與底部分頁列 (此時還沒有資料，可以安心截圖)。
- [ ] 分頁名稱完全符合，全小寫：`holdings`、`accounts`、`trades`、`transfers`(`presets` 選填)
- [ ] 標題拼字完全一致、沒有前後空白、沒有合併儲存格
- [ ] `holdings` 的 `symbol` 欄已設為「格式 → 數值 → 純文字」

### Step 4：填入期初資料

**使用者操作**：貼上 Step 1 的列，自行填入數量、成本、餘額 (agent 不需要知道金額)。

**驗收截圖**：請使用者**遮住或刪除截圖中的金額欄** (`quantity`、`avg_cost`、`opening_balance`)，只檢查其他欄。
- [ ] `holdings.type` ∈ `TW_STOCK` / `US_STOCK` / `CRYPTO` / `FX`；`currency` ∈ `TWD` / `USD`
- [ ] `quote_id` 格式正確：上市 `2330.TW`、上櫃 `6488.TWO`、美股 `VOO`、加密 `BTC-USDT`
- [ ] 有一列 `FX`，`quote_id` = `USDTWD=X`
- [ ] 每個 `holdings.account`(除 `FX` 外) 若要記交易，在 `accounts` 中有交割帳戶：某列 `broker` = 該名稱，或有同名帳戶
- [ ] 所有 `accounts.opening_date` 為日期格式 (儲存格靠右對齊)，且是同一天
- [ ] `accounts.account` 沒有重複
- [ ] 前導零保留 (如 `006208`)

### Step 5：Apps Script 與 token

**使用者操作：**
1. 試算表「擴充功能 → Apps Script」，刪除預設內容，貼上 [apps_script/Code.gs](apps_script/Code.gs) 全文並儲存
2. 產生 token：用密碼管理器產生 32 字元以上的隨機字串並存在密碼管理器中。macOS 也可在終端機執行 `openssl rand -base64 32 | pbcopy`(直接複製到剪貼簿，不會顯示在畫面上)
3. 「專案設定 (齒輪)→ 指令碼屬性 → 新增」：屬性 `API_TOKEN`，值貼上 token
4. 回到編輯器，上方函式選 `test_run` → 執行 → 依提示授權 (「進階 → 前往 (不安全)」是因為這是使用者自己的未驗證專案)

**驗收截圖：**
- 指令碼屬性頁：**只截屬性名稱那一欄**，不可包含值
  - [ ] 屬性名稱為 `API_TOKEN`(大寫、底線)
- `test_run` 的執行紀錄
  - [ ] 顯示 `{"ok":true,"holdings":N,"accounts":N,"trades":0,"transfers":0}`，N 與試算表列數相符

**常見錯誤：**

| 紀錄內容 | 原因 |
|---|---|
| `API_TOKEN not configured` | 指令碼屬性名稱拼錯或沒儲存 |
| `找不到分頁：xxx` | 分頁名稱不符 |
| `xxx 分頁缺少欄位` | 標題列拼字不符 |

### Step 6：部署 Web App

**使用者操作**：「部署 → 新增部署作業 → 齒輪選『網頁應用程式』」，執行身分：**我**；存取權：**所有人** → 部署 → 複製網址存進密碼管理器。

**驗收截圖**：按下「部署」**之前**的設定畫面 (此時還沒有網址)。
- [ ] 執行身分 = 我 (使用者的帳號)
- [ ] 存取權 = 所有人 (不是「擁有 Google 帳戶的所有人」)

向使用者說明：「所有人」只代表網址可被呼叫，沒有正確 token 的請求一律被拒絕。

**之後修改 Code.gs**：「部署 → 管理部署作業 → 編輯 (鉛筆)→ 版本：新版本 → 部署」，網址不變。不要新增第二個部署作業。

### Step 7：測試 API

**使用者操作**：在 repo 目錄執行 `zsh scripts/test_api.sh`(需要 Node.js)，依提示輸入網址與 token。

**驗收**：請使用者貼上輸出 (只含筆數與報價，不含金額)。
- [ ] `ok : true`
- [ ] 各分頁筆數正確
- [ ] 每個報價代號都有價格；顯示 `NO QUOTE` 的代表 `quote_id` 有誤

**常見錯誤：**

| 輸出 | 原因 |
|---|---|
| `ERROR: unauthorized` | token 不符；或網址是舊的部署作業 |
| `ERROR: missing token` | body 沒送出，通常是網址錯誤 |
| `Non-JSON response` | 存取權不是「所有人」 (回傳了登入頁)，或網址不是 `/exec` 結尾 |

### Step 8：登入與對帳

**使用者操作**：開啟網站，輸入網址與 token 登入；手機可「加入主畫面」。

**驗收截圖**：總覽頁 (請先按右上角「隱藏」遮蔽金額)。
- [ ] 沒有紅色錯誤或警告
- [ ] 帳戶區塊與帳戶現金的分組符合 Step 1 的規劃
- [ ] 每個標的都有報價 (沒有「無報價」字樣)
- 金額由使用者自行與銀行 / 券商 App 比對；虛擬拆分的帳戶要加總後比對

### Step 9：試記一筆

**使用者操作**：用「記一筆」記一筆小額轉帳與一筆交易，確認總覽變化正確後，到試算表刪除這兩列測試資料。

- [ ] 轉帳後兩個帳戶餘額一增一減
- [ ] 交易的持股在成交日變動，現金在交割日才變動

---

## 3. 架構與資料流

```
fetch_sheet (src/lib/api.ts)
  → replay(sheet, now)             期初 + trades (持股看 trade_date、現金看 settle_date)+ transfers
  → build_portfolio(...)           報價、分組、交割款不足提醒      → 總覽
  → build_history(...)             每天重播 + 歷史收盤價            → 走勢
  → build_forecast_data + simulate                                  → 試算
```

```yaml
invest_bucket(account):          # src/lib/portfolio.ts — 決定走勢與試算的投資範圍
  - if: type in [BROKER, EXCHANGE]
    then: broker || account
  - if: broker
    then: broker
  - else: group || null          # null = 不屬於投資範圍
```

| 位置 | 內容 |
|---|---|
| `apps_script/Code.gs` | 後端：token 驗證、讀分頁、Yahoo 報價、寫入驗證 |
| `src/lib/` | 計算邏輯 (純函式) |
| `src/components/` | 畫面 |
| `src/hooks/` | 資料載入 |
| `src/lib/storage.ts` | 裝置端設定 (localStorage)；登出時清除 |

---

## 4. Sheet schema

欄位依**標題名稱**對應，順序不限。

```yaml
holdings:            # 起始日的持股
  columns: [type, symbol, quote_id, name, quantity, avg_cost, currency, account, sheet_price, expected_return, note]
  enums:
    type: [TW_STOCK, US_STOCK, CRYPTO, FX]
    currency: [TWD, USD]
  notes:
    quote_id: "2330.TW | 6488.TWO | VOO | BTC-USDT | USDTWD=X"
    avg_cost: "以 currency 計價；FX 列填了即手動覆蓋匯率"
    expected_return: "百分比，8 = 8%；空白時用試算頁進階設定的預設 APY 年化報酬率，初始 TW 8 / US 10 / CRYPTO 10"
    quantity_zero: "允許 (新標的由 App 自動新增，數量 0)"

accounts:            # 起始日的現金
  columns: [account, type, currency, opening_balance, opening_date, broker, group, note]
  enums:
    type: [BANK, BROKER, EXCHANGE]
    currency: [TWD, USD]          # USDT 視為 USD
  unique: [account]
  notes:
    opening_date: "日期格式，如 2026-10-21"
    broker: "此帳戶是哪個 holdings.account 的固定交割帳戶；每個持股帳戶最多一個"
    group: "持股帳戶名稱 = 該部位待投入現金；其他名稱 = 獨立儲備；空白 = 不列入投資範圍"
    note: "含「緊急預備金」時，總覽資產分布會單獨列出"

trades:              # 由 App / API 寫入
  columns: [id, trade_date, account, action, symbol, quantity, price, fee, tax, amount, cash_account, settle_date, note, created_at]
  formats: { trade_date: YYYYMMDD, settle_date: YYYYMMDD }
  enums: { action: [BUY, SELL, DIVIDEND] }

transfers:           # 由 App / API 寫入
  columns: [id, datetime, from_account, to_account, amount, to_amount, fee, note, created_at]
  formats: { datetime: "YYYYMMDD HHMMSS" }
  notes:
    from_account_empty: 收入
    to_account_empty: 支出

presets:             # 選填，記一筆的快速備註
  columns: [kind, note]
  enums: { kind: [TRANSFER, INCOME, EXPENSE, ALL] }
  variables: ["{prev_month}", "{roc_ym}", "{rate}"]
```

---

## 5. API 規格

所有請求：`POST <Web App 網址>`，`Content-Type: text/plain`(避免 CORS preflight)，body 為 JSON，需跟隨 302 轉址 (curl 用 `-L`)。回應為 `{"ok": true, ...}` 或 `{"ok": false, "error": "..."}`。

| action | body | 回應 |
|---|---|---|
| `get`(預設) | `{"token", "action": "get"}` | `holdings`、`accounts`、`trades`、`transfers`、`presets`、`quotes`、`updated_at` |
| `history` | `{"token", "action": "history", "start": "YYYYMMDD", "interval": "1d" \| "1mo"}` | `series: { [quote_id]: [["YYYY-MM-DD", close], ...] }`(只含 Yahoo 標的；加密貨幣由前端向 OKX 取得) |
| `add_trade` | `{"token", "action": "add_trade", "record": {...}}` | `{"ok": true, "id"}` |
| `add_transfer` | `{"token", "action": "add_transfer", "record": {...}}` | `{"ok": true, "id"}` |

```yaml
add_trade.record:
  id: UUID v4                     # 必填；重送時沿用同一個 id，伺服器拒絕重複
  trade_date: YYYYMMDD            # 必填
  settle_date: YYYYMMDD           # 必填；台股通常 T+2
  account: string                 # 必填；必須存在於 holdings.account
  action: BUY | SELL | DIVIDEND
  symbol: string                  # 必填
  quantity: number >= 0           # BUY / SELL 必填且 > 0
  price: number >= 0              # BUY / SELL 必填且 > 0
  fee: number >= 0                # 選填
  tax: number >= 0                # 選填
  amount: number > 0              # 必填；實付 (買)/ 實收 (賣、股利)
  note: string                    # 選填；以 = + - @ 開頭會被存成純文字
  new_holding:                    # 僅 BUY 且 symbol 不在該帳戶 holdings 時必填；已存在時不可附
    type: TW_STOCK | US_STOCK | CRYPTO
    quote_id: string              # TW: ^\d{4,6}[A-Z]?\.TWO?$ ; US: 大寫英數 ; CRYPTO: <SYMBOL>-USDT
    name: string
  # cash_account 由伺服器依 accounts.broker 決定，送了也會被忽略

add_transfer.record:
  id: UUID v4
  datetime: "YYYYMMDD HHMMSS"
  from_account: string            # 空白 = 收入
  to_account: string              # 空白 = 支出；兩者不可同時空白或相同
  amount: number > 0              # 轉出金額 (from_account 的幣別)
  to_amount: number               # 跨幣別時必填 (轉入帳戶實收金額)
  fee: number >= 0                # 選填，從 from_account 扣
  note: string
```

---

## 6. 常見任務

| 任務 | 做法 |
|---|---|
| 新使用者架設 | 依 §2 逐步引導，每步驗收後再繼續 |
| 新增帳戶 | 請使用者在 `accounts` 手動新增一列 (API 不提供)；依 §2 Step 1 的決策規則填 `type` / `broker` / `group` |
| 新增標的 | App「記一筆 → 買進 → ＋ 新增標的」，或 `add_trade` 附 `new_holding`；之後提醒補上 `expected_return` |
| 記錯帳 | 請使用者在試算表修改或刪除該列 |
| 對帳不符 | 依序檢查：期初餘額 → 是否漏記轉帳 / 收支 → 交割日是否已到 → 虛擬拆分的帳戶是否加總比對 |
| 報價缺失 | 檢查 `quote_id` 格式；可暫填 `sheet_price` 當備援 |
| Token 外洩 | 依 S5 輪替 |
| 修改程式 | 見 §7 |

---

## 7. 修改程式的規則

- 檔名與變數用 `snake_case`(框架強制的名稱除外)；程式碼註解精簡、使用英文
- 只用常見、官方的套件；新增執行期依賴前先徵得使用者同意
- 完成後執行 `npm run lint` 與 `npm run build`，兩者都要通過
- 同步更新 [README.md](README.md) (功能與使用者文件)、本文件 (規格、流程)，以及介面上的說明視窗 [src/components/info_content.tsx](src/components/info_content.tsx)
- 後端欄位變動需同時修改 `apps_script/Code.gs`、`src/types.ts`、README、本文件 §4 / §5，並提醒使用者部署 Apps Script 新版本
- git 指令與 commit message 由使用者決定是否執行；不要自行 commit 或 push
