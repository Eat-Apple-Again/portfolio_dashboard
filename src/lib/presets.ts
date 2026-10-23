/**
 * Note templates from the `presets` sheet:
 *   {prev_month} -> previous month as YYYY.MM   (Salary({prev_month}) -> Salary(2026.09))
 *   {roc_ym}     -> current ROC year + month    ({roc_ym}房租 -> 11510房租)
 *   {rate}       -> exchange rate of the entered amounts, 3 decimals
 */
export function expand_note(template: string, now: Date, rate: number | null): string {
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const mm = (d: Date) => String(d.getMonth() + 1).padStart(2, '0')
  return template
    .replaceAll('{prev_month}', `${prev.getFullYear()}.${mm(prev)}`)
    .replaceAll('{roc_ym}', `${now.getFullYear() - 1911}${mm(now)}`)
    .replaceAll('{rate}', rate != null && Number.isFinite(rate) ? rate.toFixed(3) : '{rate}')
}

export function has_template(note: string): boolean {
  return /\{(prev_month|roc_ym|rate)\}/.test(note)
}
