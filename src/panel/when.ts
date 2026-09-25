const time = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' })
const dayMonth = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' })
const full = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short' })

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** Kort tidpunkt som i en fillista: "06:20" i dag, "igår 06:20", "25 sep." i år, annars "2025-09-25". */
export function shortWhen(iso: string, now = new Date()): string {
  const d = new Date(iso)
  if (sameDay(d, now)) return time.format(d)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return `igår ${time.format(d)}`
  if (d.getFullYear() === now.getFullYear()) return dayMonth.format(d)
  return full.format(d)
}
