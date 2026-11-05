export const calendarMin = '2000-01-01'
export const calendarMax = '2099-12-31'
export const calendarMonths = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

export function calendarDate(value: string): Date | null {
  if (!/^(?:20\d{2}|2100)-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value ? date : null
}
export const calendarIso = (date: Date) => date.toISOString().slice(0,10)
export const calendarToday = (now = new Date()) => new Date(now.getTime()+7*3600000).toISOString().slice(0,10)
export function calendarAddDays(value: string, days: number) {
  const date = calendarDate(value)
  if (!date) return value
  date.setUTCDate(date.getUTCDate()+days)
  return calendarIso(date)
}
export function calendarMoveMonth(value: string, months: number) {
  const date = calendarDate(value)
  if (!date) return value
  const day = date.getUTCDate()
  date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+months)
  const last = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()
  date.setUTCDate(Math.min(day,last))
  return calendarIso(date)
}
export function calendarCells(month: string): string[] {
  const date = calendarDate(month+'-01')
  if (!date) return []
  const first = calendarAddDays(calendarIso(date),-((date.getUTCDay()+6)%7))
  // Grid padding can cross the supported year range; those dates stay disabled.
  const start = new Date(first+'T00:00:00Z')
  return Array.from({length:42},(_,i)=>calendarIso(new Date(start.getTime()+i*86400000)))
}
export function calendarLabel(value: string) {
  const date = calendarDate(value)
  return date ? new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(date) : 'Pilih tanggal'
}
