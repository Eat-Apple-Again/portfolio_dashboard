const pad = (n: number, w = 2) => String(n).padStart(w, '0')

export function to_ts(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/** Local time -> "YYYYMMDD" */
export function fmt_compact_date(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

/** Local time -> "YYYYMMDD HHMMSS" */
export function fmt_compact_datetime(d: Date): string {
  return `${fmt_compact_date(d)} ${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/** "YYYYMMDD" or "YYYYMMDD HHMMSS" -> Date (local); null if malformed or impossible (e.g. 20261345) */
export function parse_compact(s: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?: (\d{2})(\d{2})(\d{2}))?$/.exec(s.trim())
  if (!m) return null
  const [y, mo, d, h = 0, mi = 0, se = 0] = m.slice(1).map((v) => (v === undefined ? undefined : Number(v)))
  const date = new Date(y!, mo! - 1, d!, h, mi, se)
  const valid =
    date.getFullYear() === y &&
    date.getMonth() === mo! - 1 &&
    date.getDate() === d &&
    date.getHours() === h &&
    date.getMinutes() === mi &&
    date.getSeconds() === se
  return valid ? date : null
}

/** Skips weekends only; public holidays must be adjusted manually */
export function add_business_days(d: Date, days: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  let left = days
  while (left > 0) {
    out.setDate(out.getDate() + 1)
    const wd = out.getDay()
    if (wd !== 0 && wd !== 6) left--
  }
  return out
}

/** "YYYYMMDD" <-> "YYYY-MM-DD" (value format of <input type="date">) */
export function compact_to_input(s: string): string {
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : ''
}

export function input_to_compact(s: string): string {
  return s.replace(/-/g, '')
}

/** "YYYYMMDD HHMMSS" <-> "YYYY-MM-DDTHH:MM:SS" (value format of <input type="datetime-local">) */
export function compact_to_datetime_input(s: string): string {
  const m = /^(\d{4})(\d{2})(\d{2}) (\d{2})(\d{2})(\d{2})$/.exec(s)
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : ''
}

// Browsers omit seconds when they are 00
export function datetime_input_to_compact(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s)
  return m ? `${m[1]}${m[2]}${m[3]} ${m[4]}${m[5]}${m[6] ?? '00'}` : ''
}
