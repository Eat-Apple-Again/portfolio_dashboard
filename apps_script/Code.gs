/**
 * Portfolio Dashboard - Google Apps Script backend.
 * Reads holdings / accounts / trades / transfers, fetches Yahoo Finance quotes server-side (avoids browser CORS),
 * and appends new trades / transfers after strict validation.
 * Auth: POST body {"token": "<API_TOKEN>"}; the token lives in Script Properties, never in code or URLs.
 */

const SHEET = { holdings: 'holdings', accounts: 'accounts', trades: 'trades', transfers: 'transfers', presets: 'presets' };
const HISTORY_INTERVALS = ['1d', '1mo'];
const YAHOO_TYPES = ['TW_STOCK', 'US_STOCK', 'FX'];
const TRADE_ACTIONS = ['BUY', 'SELL', 'DIVIDEND'];
// Allowed shapes for holdings created from the app (BUY of a new symbol)
const NEW_HOLDING_RULES = {
  TW_STOCK: { currency: 'TWD', symbol: /^\d{4,6}[A-Z]?$/, quote_id: /^\d{4,6}[A-Z]?\.TWO?$/ },
  US_STOCK: { currency: 'USD', symbol: /^[A-Z][A-Z0-9.]{0,9}$/, quote_id: /^[A-Z][A-Z0-9.-]{0,9}$/ },
  CRYPTO: { currency: 'USD', symbol: /^[A-Z0-9]{1,15}$/, quote_id: /^[A-Z0-9]{1,15}-USDT$/ },
};
const CACHE_SECONDS = 60;
const HISTORY_CACHE_SECONDS = 6 * 60 * 60;
const HISTORY_MAX_DAYS = 11 * 366; // 10 years of monthly data plus slack for the month-aligned start
const MAX_AMOUNT = 1e12;

function doGet() {
  return json_({ ok: false, error: 'use POST' });
}

// Client should send Content-Type: text/plain to avoid a CORS preflight
function doPost(e) {
  let body = {};
  try {
    body = JSON.parse(e.postData.contents) || {};
  } catch (_) {
    // invalid JSON -> treated as missing token
  }
  return json_(handle_(body));
}

function handle_(body) {
  const token = str_(PropertiesService.getScriptProperties().getProperty('API_TOKEN'));
  if (!token) return { ok: false, error: 'API_TOKEN not configured' };

  const provided = str_(body.token);
  if (!provided) return { ok: false, error: 'missing token' };
  if (provided !== token) return { ok: false, error: 'unauthorized' };

  try {
    switch (body.action || 'get') {
      case 'get':
        return get_all_();
      case 'history':
        return get_history_(body.start, body.interval);
      case 'add_trade':
        return with_lock_(() => add_trade_(body.record || {}));
      case 'add_transfer':
        return with_lock_(() => add_transfer_(body.record || {}));
      default:
        return { ok: false, error: 'unknown action' };
    }
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

// ---------- read ----------

function get_all_() {
  const holdings = read_rows_(SHEET.holdings).map((r) => ({
    type: str_(r.type).toUpperCase(),
    symbol: str_(r.symbol),
    quote_id: str_(r.quote_id),
    name: str_(r.name),
    quantity: num_(r.quantity),
    avg_cost: num_(r.avg_cost),
    currency: str_(r.currency).toUpperCase(),
    account: str_(r.account),
    sheet_price: num_(r.sheet_price),
    note: str_(r.note),
  }));

  const accounts = read_rows_(SHEET.accounts).map((r) => ({
    account: str_(r.account),
    type: str_(r.type).toUpperCase(),
    currency: str_(r.currency).toUpperCase(),
    opening_balance: num_(r.opening_balance),
    opening_date: date_cell_(r.opening_date),
    broker: str_(r.broker),
    group: str_(r.group),
    note: str_(r.note),
  }));

  const trades = read_rows_(SHEET.trades).map((r) => ({
    id: str_(r.id),
    trade_date: date_cell_(r.trade_date),
    account: str_(r.account),
    action: str_(r.action).toUpperCase(),
    symbol: str_(r.symbol),
    quantity: num_(r.quantity),
    price: num_(r.price),
    fee: num_(r.fee),
    tax: num_(r.tax),
    amount: num_(r.amount),
    cash_account: str_(r.cash_account),
    settle_date: date_cell_(r.settle_date),
    note: str_(r.note),
  }));

  const transfers = read_rows_(SHEET.transfers).map((r) => ({
    id: str_(r.id),
    datetime: date_cell_(r.datetime),
    from_account: str_(r.from_account),
    to_account: str_(r.to_account),
    amount: num_(r.amount),
    to_amount: num_(r.to_amount),
    fee: num_(r.fee),
    note: str_(r.note),
  }));

  // Optional sheet: quick-pick notes for the entry form
  const presets = read_optional_rows_(SHEET.presets)
    .map((r) => ({ kind: str_(r.kind).toUpperCase(), note: str_(r.note) }))
    .filter((p) => p.note);

  const yahoo_ids = holdings
    .filter((h) => YAHOO_TYPES.includes(h.type) && h.quote_id)
    .map((h) => h.quote_id);

  return {
    ok: true,
    updated_at: new Date().toISOString(),
    holdings,
    accounts,
    trades,
    transfers,
    presets,
    quotes: fetch_yahoo_quotes_(yahoo_ids),
  };
}

function read_optional_rows_(name) {
  return SpreadsheetApp.getActive().getSheetByName(name) ? read_rows_(name) : [];
}

/** Rows as objects keyed by header; fully empty rows are skipped */
function read_rows_(name) {
  const sheet = get_sheet_(name);
  const [header, ...rows] = sheet.getDataRange().getValues();
  const keys = header.map(str_);
  return rows
    .filter((r) => r.some((c) => str_(c)))
    .map((r) => {
      const obj = {};
      keys.forEach((k, i) => k && (obj[k] = r[i]));
      return obj;
    });
}

/** Returns { [quote_id]: { price, prev_close, currency, time } | null } */
function fetch_yahoo_quotes_(ids) {
  const unique = [...new Set(ids)];
  const cache = CacheService.getScriptCache();
  const cached = cache.getAll(unique.map((id) => 'q:' + id));
  const result = {};
  const missing = [];

  unique.forEach((id) => {
    const hit = cached['q:' + id];
    if (hit) result[id] = JSON.parse(hit);
    else missing.push(id);
  });
  if (missing.length === 0) return result;

  // fetchAll sends requests in parallel
  const responses = UrlFetchApp.fetchAll(
    missing.map((id) => ({
      url: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(id)}?interval=1d&range=1d`,
      muteHttpExceptions: true,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }))
  );

  const to_cache = {};
  responses.forEach((res, i) => {
    const id = missing[i];
    result[id] = null;
    if (res.getResponseCode() !== 200) return;
    try {
      const meta = JSON.parse(res.getContentText()).chart.result[0].meta;
      result[id] = {
        price: meta.regularMarketPrice,
        prev_close: meta.chartPreviousClose ?? meta.previousClose ?? null,
        currency: meta.currency,
        time: meta.regularMarketTime * 1000,
      };
      to_cache['q:' + id] = JSON.stringify(result[id]);
    } catch (_) {
      // leave as null; frontend falls back to sheet_price
    }
  });
  cache.putAll(to_cache, CACHE_SECONDS);
  return result;
}

// ---------- history ----------

/** Closes since `start` (YYYYMMDD) for every Yahoo-quoted holding: { [quote_id]: [[YYYY-MM-DD, close], ...] }; interval 1d or 1mo */
function get_history_(start, interval) {
  const bar = interval ? enum_(interval, HISTORY_INTERVALS.map((v) => v.toUpperCase()), 'interval').toLowerCase() : '1d';
  const from = date_(start, 'start');
  const days = (Date.now() - from.getTime()) / 86400000;
  if (days < 0 || days > HISTORY_MAX_DAYS) fail_('start 超出可查詢範圍');

  const ids = [
    ...new Set(
      read_rows_(SHEET.holdings)
        .filter((h) => YAHOO_TYPES.includes(str_(h.type).toUpperCase()) && str_(h.quote_id))
        .map((h) => str_(h.quote_id))
    ),
  ];
  const cache = CacheService.getScriptCache();
  const key = (id) => `h:${bar}:${id}:${str_(start)}`;
  const cached = cache.getAll(ids.map(key));
  const series = {};
  const missing = ids.filter((id) => {
    const hit = cached[key(id)];
    if (hit) series[id] = JSON.parse(hit);
    return !hit;
  });

  // A week of lead-in so the first day has a previous close to carry forward
  const period1 = Math.floor(from.getTime() / 1000) - 7 * 86400;
  const period2 = Math.floor(Date.now() / 1000);
  const responses = UrlFetchApp.fetchAll(
    missing.map((id) => ({
      url: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(id)}?interval=${bar}&period1=${period1}&period2=${period2}`,
      muteHttpExceptions: true,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }))
  );

  const to_cache = {};
  responses.forEach((res, i) => {
    const id = missing[i];
    series[id] = [];
    if (res.getResponseCode() !== 200) return;
    try {
      const result = JSON.parse(res.getContentText()).chart.result[0];
      const tz = result.meta.exchangeTimezoneName || 'UTC';
      const closes = result.indicators.quote[0].close;
      (result.timestamp || []).forEach((ts, j) => {
        if (closes[j] == null) return;
        series[id].push([Utilities.formatDate(new Date(ts * 1000), tz, 'yyyy-MM-dd'), closes[j]]);
      });
      to_cache[key(id)] = JSON.stringify(series[id]);
    } catch (_) {
      // leave empty; frontend carries the nearest known price
    }
  });
  if (Object.keys(to_cache).length) cache.putAll(to_cache, HISTORY_CACHE_SECONDS);
  return { ok: true, series };
}

// ---------- write (append-only) ----------

function add_trade_(r) {
  const accounts = read_rows_(SHEET.accounts);
  const account_names = new Set(accounts.map((a) => str_(a.account)));
  const holdings = read_rows_(SHEET.holdings);

  const action = enum_(r.action, TRADE_ACTIONS, 'action');
  const account = str_(r.account);
  const symbol = str_(r.symbol);
  const holding_accounts = new Set(holdings.map((h) => str_(h.account)));
  if (!holding_accounts.has(account) && !account_names.has(account)) fail_(`帳戶不存在：${account}`);

  const exists = holdings.some((h) => str_(h.account) === account && str_(h.symbol) === symbol);
  const new_holding = r.new_holding ? validate_new_holding_(r.new_holding, account, symbol, action) : null;
  if (exists && new_holding) fail_(`${account} / ${symbol} 已存在，請直接從清單選擇`);
  if (!exists && !new_holding) fail_(`holdings 中找不到 ${account} / ${symbol}`);

  // Fixed settlement account per broker (accounts.broker), ignoring any client-supplied value
  const cash_account = settlement_account_(accounts, account);
  if (!cash_account) fail_(`accounts 中沒有 broker 為「${account}」的交割帳戶`);

  const record = {
    id: id_(r.id),
    trade_date: date_(r.trade_date, 'trade_date'),
    account,
    action,
    symbol,
    quantity: amount_(r.quantity, 'quantity', action !== 'DIVIDEND'),
    price: amount_(r.price, 'price', action !== 'DIVIDEND'),
    fee: amount_(r.fee, 'fee', false),
    tax: amount_(r.tax, 'tax', false),
    amount: amount_(r.amount, 'amount', true),
    cash_account,
    settle_date: date_(r.settle_date, 'settle_date'),
    note: note_(r.note),
    created_at: new Date(),
  };

  // New symbol: opening position of 0 so the BUY builds it up from the start date
  if (new_holding) append_record_(SHEET.holdings, new_holding, {});
  append_record_(SHEET.trades, record, {
    trade_date: 'yyyymmdd',
    settle_date: 'yyyymmdd',
    created_at: 'yyyy-mm-dd hh:mm:ss',
  });
  return { ok: true, id: record.id };
}

/** Cash account whose `broker` column names this broker; falls back to an account with the same name */
function settlement_account_(accounts, broker) {
  const mapped = accounts.find((a) => str_(a.broker) === broker);
  if (mapped) return str_(mapped.account);
  const same = accounts.find((a) => str_(a.account) === broker);
  return same ? str_(same.account) : '';
}

function validate_new_holding_(h, account, symbol, action) {
  if (action !== 'BUY') fail_('只有「買進」可以新增標的');
  const type = enum_(h.type, Object.keys(NEW_HOLDING_RULES), 'type');
  const rule = NEW_HOLDING_RULES[type];
  const quote_id = str_(h.quote_id);
  if (!rule.symbol.test(symbol)) fail_(`代號格式不符：${symbol}`);
  if (!rule.quote_id.test(quote_id)) fail_(`報價代號格式不符：${quote_id}`);
  return {
    type,
    symbol,
    quote_id,
    name: note_(h.name).slice(0, 50),
    quantity: 0,
    avg_cost: 0,
    currency: rule.currency,
    account,
  };
}

/** Transfer between own accounts, or income (no from_account) / expense (no to_account) */
function add_transfer_(r) {
  const accounts = {};
  read_rows_(SHEET.accounts).forEach((a) => (accounts[str_(a.account)] = str_(a.currency).toUpperCase()));

  const from = str_(r.from_account);
  const to = str_(r.to_account);
  if (!from && !to) fail_('至少需要轉出或轉入帳戶');
  if (from && !(from in accounts)) fail_(`from_account 不存在於 accounts：${from}`);
  if (to && !(to in accounts)) fail_(`to_account 不存在於 accounts：${to}`);
  if (from && from === to) fail_('轉出與轉入帳戶不可相同');

  const both = Boolean(from && to);
  const cross_currency = both && accounts[from] !== accounts[to];
  const record = {
    id: id_(r.id),
    datetime: datetime_(r.datetime, 'datetime'),
    from_account: from,
    to_account: to,
    amount: amount_(r.amount, 'amount', true),
    to_amount: both ? amount_(r.to_amount, 'to_amount', cross_currency) : '',
    fee: from ? amount_(r.fee, 'fee', false) : '',
    note: note_(r.note),
    created_at: new Date(),
  };
  append_record_(SHEET.transfers, record, { datetime: 'yyyymmdd hhmmss', created_at: 'yyyy-mm-dd hh:mm:ss' });
  return { ok: true, id: record.id };
}

/** Appends one row mapped by header names; rejects duplicate ids (double submit) */
function append_record_(name, record, formats) {
  const sheet = get_sheet_(name);
  const last_col = sheet.getLastColumn();
  const header = sheet.getRange(1, 1, 1, last_col).getValues()[0].map(str_);
  const missing = Object.keys(record).filter((k) => !header.includes(k));
  if (missing.length) fail_(`${name} 分頁缺少欄位：${missing.join(', ')}`);

  const last_row = sheet.getLastRow();
  if ('id' in record && last_row > 1) {
    const ids = sheet.getRange(2, header.indexOf('id') + 1, last_row - 1, 1).getValues().map((r) => str_(r[0]));
    if (ids.includes(record.id)) fail_('這筆紀錄已經送出過了');
  }

  const row_index = last_row + 1;
  // Plain-text format first so codes like 006208 keep their leading zeros
  Object.keys(record).forEach((k) => {
    if (typeof record[k] === 'string') sheet.getRange(row_index, header.indexOf(k) + 1).setNumberFormat('@');
  });
  sheet.getRange(row_index, 1, 1, last_col).setValues([header.map((h) => (h in record ? record[h] : ''))]);
  Object.keys(formats).forEach((k) => {
    sheet.getRange(row_index, header.indexOf(k) + 1).setNumberFormat(formats[k]);
  });
}

function with_lock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) fail_('系統忙碌中，請稍後再試');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ---------- validation ----------

function fail_(message) {
  throw new Error(message);
}

function id_(v) {
  const s = str_(v);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) fail_('id 格式錯誤');
  return s;
}

function enum_(v, allowed, field) {
  const s = str_(v).toUpperCase();
  if (!allowed.includes(s)) fail_(`${field} 必須是 ${allowed.join(' / ')}`);
  return s;
}

/** Non-negative number; '' allowed when not required */
function amount_(v, field, required) {
  if (v === '' || v == null) {
    if (required) fail_(`${field} 必填`);
    return '';
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) fail_(`${field} 數值無效`);
  if (required && n === 0) fail_(`${field} 必須大於 0`);
  return n;
}

/** "YYYYMMDD HHMMSS" in the spreadsheet's time zone */
function datetime_(v, field) {
  const s = str_(v);
  if (!/^\d{8} \d{6}$/.test(s)) fail_(`${field} 格式應為 YYYYMMDD HHMMSS`);
  return parse_strict_(s, 'yyyyMMdd HHmmss', field);
}

/** "YYYYMMDD" */
function date_(v, field) {
  const s = str_(v);
  if (!/^\d{8}$/.test(s)) fail_(`${field} 格式應為 YYYYMMDD`);
  return parse_strict_(s, 'yyyyMMdd', field);
}

// Round-trip check rejects impossible dates such as 20261345
function parse_strict_(s, pattern, field) {
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const d = Utilities.parseDate(s, tz, pattern);
  if (Utilities.formatDate(d, tz, pattern) !== s) fail_(`${field} 不是有效的日期`);
  return d;
}

/** Free text: strip control chars, cap length, and neutralize formula prefixes */
function note_(v) {
  const s = str_(v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// ---------- helpers ----------

function get_sheet_(name) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) fail_(`找不到分頁：${name}`);
  return sheet;
}

/** Date cell -> ISO string; also accepts "YYYYMMDD", "YYYY-MM-DD" or "YYYY/MM/DD" text */
function date_cell_(v) {
  if (v instanceof Date) return v.toISOString();
  const s = str_(v).replace(/[-/]/g, '');
  if (!/^\d{8}( \d{6})?$/.test(s)) return null;
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  return Utilities.parseDate(s, tz, s.length === 8 ? 'yyyyMMdd' : 'yyyyMMdd HHmmss').toISOString();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function str_(v) {
  return v == null ? '' : String(v).trim();
}

function num_(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Run in the editor to authorize and check the read path */
function test_run() {
  const token = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  const res = handle_({ token });
  Logger.log(
    JSON.stringify({
      ok: res.ok,
      error: res.error,
      holdings: res.holdings && res.holdings.length,
      accounts: res.accounts && res.accounts.length,
      trades: res.trades && res.trades.length,
      transfers: res.transfers && res.transfers.length,
    })
  );
}
