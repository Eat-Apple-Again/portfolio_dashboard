/**
 * Portfolio Dashboard - Google Apps Script backend.
 * Reads the `holdings` sheet and fetches Yahoo Finance quotes server-side (avoids browser CORS).
 * Auth: POST body {"token": "<API_TOKEN>"}; the token lives in Script Properties, never in code or URLs.
 */

const SHEET_NAME = 'holdings';
const YAHOO_TYPES = ['TW_STOCK', 'US_STOCK', 'FX'];
const CACHE_SECONDS = 60;

function doGet() {
  return json_({ ok: false, error: 'use POST' });
}

// Client should send Content-Type: text/plain to avoid a CORS preflight
function doPost(e) {
  let body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (_) {
    // invalid JSON -> treated as missing token
  }
  return json_(handle_((body || {}).token));
}

function handle_(provided_token) {
  const token = str_(PropertiesService.getScriptProperties().getProperty('API_TOKEN'));
  if (!token) return { ok: false, error: 'API_TOKEN not configured' };

  const provided = str_(provided_token);
  if (!provided) return { ok: false, error: 'missing token' };
  if (provided !== token) return { ok: false, error: 'unauthorized' };

  try {
    const holdings = read_holdings_();
    const yahoo_ids = holdings
      .filter((h) => YAHOO_TYPES.includes(h.type) && h.quote_id)
      .map((h) => h.quote_id);
    return {
      ok: true,
      updated_at: new Date().toISOString(),
      holdings,
      quotes: fetch_yahoo_quotes_(yahoo_ids),
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function read_holdings_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found`);

  const [header, ...rows] = sheet.getDataRange().getValues();
  const col = {};
  header.forEach((h, i) => (col[str_(h)] = i));
  const get = (row, key) => (key in col ? row[col[key]] : '');

  return rows
    .filter((r) => str_(get(r, 'type')))
    .map((r) => ({
      type: str_(get(r, 'type')).toUpperCase(),
      symbol: str_(get(r, 'symbol')),
      quote_id: str_(get(r, 'quote_id')),
      name: str_(get(r, 'name')),
      quantity: num_(get(r, 'quantity')),
      avg_cost: num_(get(r, 'avg_cost')),
      currency: str_(get(r, 'currency')).toUpperCase(),
      account: str_(get(r, 'account')),
      sheet_price: num_(get(r, 'sheet_price')),
      note: str_(get(r, 'note')),
    }));
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

/** Run this once in the editor to authorize, then check the log output. */
function test_run() {
  const token = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  Logger.log(JSON.stringify(handle_(token)).slice(0, 1000));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function str_(v) {
  return v == null ? '' : String(v).trim();
}

function num_(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
