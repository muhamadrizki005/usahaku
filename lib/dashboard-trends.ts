import type { Sale } from './pos'

export type TrendPeriod =
  | '7d'
  | '30d'
  | '1m'
  | '3m'
  | '6m'
  | '1y'
  | 'custom'

export interface TrendBucket {
  key: string
  label: string
  shortLabel: string
  fullLabel: string
  startDate: string
  endDate: string
  amount: number
  count: number
  isCurrent: boolean
}

export interface TrendResult {
  period: TrendPeriod
  startDate: string
  endDate: string
  aggregation: 'daily' | 'weekly' | 'monthly'
  buckets: TrendBucket[]
  totalRevenue: number
  totalCount: number
  maxAmount: number
}

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
]

const MONTH_NAMES_FULL = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

const DAY_NAMES_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

/**
 * Format Date to YYYY-MM-DD in Asia/Jakarta (WIB) timezone
 */
export function toWibDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date)
}

/**
 * Get today's date string (YYYY-MM-DD) in WIB
 */
export function getTodayWib(now = new Date()): string {
  return toWibDateString(now)
}

/**
 * Extract YYYY-MM-DD from an ISO string in WIB
 */
export function getSaleWibDate(isoString: string): string {
  return toWibDateString(new Date(isoString))
}

/**
 * Add or subtract days from a date
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Add or subtract months from a date
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

/**
 * Calculate difference in days between two YYYY-MM-DD strings
 */
export function getDaysDifference(startStr: string, endStr: string): number {
  const start = Date.parse(startStr + 'T00:00:00Z')
  const end = Date.parse(endStr + 'T00:00:00Z')
  return Math.round((end - start) / 86400000) + 1
}

/**
 * Calculate start and end dates in WIB for each period preset
 */
export function getPeriodRange(
  period: TrendPeriod,
  customStart?: string,
  customEnd?: string,
  now = new Date()
): { startDate: string; endDate: string } {
  const todayStr = getTodayWib(now)

  switch (period) {
    case '7d':
      return {
        startDate: toWibDateString(addDays(now, -6)),
        endDate: todayStr,
      }
    case '30d':
      return {
        startDate: toWibDateString(addDays(now, -29)),
        endDate: todayStr,
      }
    case '1m':
      return {
        startDate: toWibDateString(addMonths(now, -1)),
        endDate: todayStr,
      }
    case '3m':
      return {
        startDate: toWibDateString(addMonths(now, -3)),
        endDate: todayStr,
      }
    case '6m':
      return {
        startDate: toWibDateString(addMonths(now, -6)),
        endDate: todayStr,
      }
    case '1y':
      return {
        startDate: toWibDateString(addMonths(now, -12)),
        endDate: todayStr,
      }
    case 'custom': {
      let start = customStart && /^\d{4}-\d{2}-\d{2}$/.test(customStart) ? customStart : toWibDateString(addDays(now, -6))
      let end = customEnd && /^\d{4}-\d{2}-\d{2}$/.test(customEnd) ? customEnd : todayStr

      // Guard: customStart cannot be after customEnd
      if (start > end) {
        start = end
      }
      return { startDate: start, endDate: end }
    }
  }
}

/**
 * Generate human-readable subtitle for the period
 */
export function getPeriodSubtitle(period: TrendPeriod, startDate: string, endDate: string): string {
  switch (period) {
    case '7d':
      return 'Ringkasan tren omzet 7 hari terakhir'
    case '30d':
      return 'Ringkasan tren omzet 30 hari terakhir'
    case '1m':
      return 'Ringkasan tren omzet 1 bulan terakhir'
    case '3m':
      return 'Ringkasan tren omzet 3 bulan terakhir'
    case '6m':
      return 'Ringkasan tren omzet 6 bulan terakhir'
    case '1y':
      return 'Ringkasan tren omzet 1 tahun terakhir'
    case 'custom':
      return `Ringkasan tren omzet periode ${startDate} s/d ${endDate}`
  }
}

/**
 * Generate daily buckets between startDate and endDate
 */
function buildDailyBuckets(startDateStr: string, endDateStr: string, todayStr: string): TrendBucket[] {
  const buckets: TrendBucket[] = []
  const start = new Date(startDateStr + 'T12:00:00+07:00')
  const end = new Date(endDateStr + 'T12:00:00+07:00')

  const totalDays = getDaysDifference(startDateStr, endDateStr)
  let cur = new Date(start)

  let index = 0
  while (cur <= end) {
    const curStr = toWibDateString(cur)
    const dayOfWeek = DAY_NAMES_SHORT[cur.getDay()]
    const dayNum = cur.getDate()
    const monthIndex = cur.getMonth()
    const monthShort = MONTH_NAMES_SHORT[monthIndex]
    const monthFull = MONTH_NAMES_FULL[monthIndex]
    const year = cur.getFullYear()

    // Label formatting: for 7d use weekday, for >7d use date or interval
    let label = dayOfWeek
    if (totalDays > 7) {
      label = `${dayNum} ${monthShort}`
    }

    const fullLabel = `${dayOfWeek}, ${dayNum} ${monthFull} ${year}`

    buckets.push({
      key: curStr,
      label,
      shortLabel: totalDays > 14 ? (index % 5 === 0 || index === totalDays - 1 ? `${dayNum} ${monthShort}` : '') : label,
      fullLabel,
      startDate: curStr,
      endDate: curStr,
      amount: 0,
      count: 0,
      isCurrent: curStr === todayStr,
    })

    cur = addDays(cur, 1)
    index++
  }

  return buckets
}

/**
 * Generate weekly buckets between startDate and endDate
 */
function buildWeeklyBuckets(startDateStr: string, endDateStr: string, todayStr: string): TrendBucket[] {
  const buckets: TrendBucket[] = []
  const start = new Date(startDateStr + 'T12:00:00+07:00')
  const end = new Date(endDateStr + 'T12:00:00+07:00')

  let cur = new Date(start)
  while (cur <= end) {
    const next = addDays(cur, 6)
    const bucketEnd = next > end ? new Date(end) : next

    const curStr = toWibDateString(cur)
    const bucketEndStr = toWibDateString(bucketEnd)

    const startDay = cur.getDate()
    const startMonth = MONTH_NAMES_SHORT[cur.getMonth()]
    const endDay = bucketEnd.getDate()
    const endMonth = MONTH_NAMES_SHORT[bucketEnd.getMonth()]

    let label = ''
    if (cur.getMonth() === bucketEnd.getMonth()) {
      label = `${startDay}-${endDay} ${startMonth}`
    } else {
      label = `${startDay} ${startMonth}-${endDay} ${endMonth}`
    }

    const fullLabel = `${startDay} ${MONTH_NAMES_FULL[cur.getMonth()]} - ${endDay} ${MONTH_NAMES_FULL[bucketEnd.getMonth()]} ${bucketEnd.getFullYear()}`
    const isCurrent = todayStr >= curStr && todayStr <= bucketEndStr

    buckets.push({
      key: `${curStr}_${bucketEndStr}`,
      label,
      shortLabel: label,
      fullLabel,
      startDate: curStr,
      endDate: bucketEndStr,
      amount: 0,
      count: 0,
      isCurrent,
    })

    cur = addDays(cur, 7)
  }

  return buckets
}

/**
 * Generate monthly buckets between startDate and endDate
 */
function buildMonthlyBuckets(startDateStr: string, endDateStr: string, todayStr: string): TrendBucket[] {
  const buckets: TrendBucket[] = []
  const start = new Date(startDateStr + 'T12:00:00+07:00')
  const end = new Date(endDateStr + 'T12:00:00+07:00')

  let cur = new Date(start.getFullYear(), start.getMonth(), 1, 12, 0, 0)
  const currentMonthKey = todayStr.slice(0, 7)

  while (cur <= end) {
    const year = cur.getFullYear()
    const month = cur.getMonth()
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`

    const monthStart = new Date(year, month, 1, 12, 0, 0)
    const monthEnd = new Date(year, month + 1, 0, 12, 0, 0)

    const monthStartStr = toWibDateString(monthStart)
    const monthEndStr = toWibDateString(monthEnd)

    const label = MONTH_NAMES_SHORT[month]
    const fullLabel = `${MONTH_NAMES_FULL[month]} ${year}`

    buckets.push({
      key: monthKey,
      label,
      shortLabel: label,
      fullLabel,
      startDate: monthStartStr,
      endDate: monthEndStr,
      amount: 0,
      count: 0,
      isCurrent: monthKey === currentMonthKey,
    })

    cur = new Date(year, month + 1, 1, 12, 0, 0)
  }

  return buckets
}

/**
 * Calculate complete revenue trend data for the chosen period
 */
export function calculateRevenueTrend(
  sales: Sale[],
  period: TrendPeriod,
  customStart?: string,
  customEnd?: string,
  now = new Date()
): TrendResult {
  const todayStr = getTodayWib(now)
  const { startDate, endDate } = getPeriodRange(period, customStart, customEnd, now)
  const diffDays = getDaysDifference(startDate, endDate)

  // Determine aggregation based on period or custom range duration
  let aggregation: 'daily' | 'weekly' | 'monthly' = 'daily'
  if (period === '6m' || period === '1y') {
    aggregation = 'monthly'
  } else if (period === '1m' || period === '3m') {
    aggregation = 'weekly'
  } else if (period === 'custom') {
    if (diffDays > 180) {
      aggregation = 'monthly'
    } else if (diffDays > 45) {
      aggregation = 'weekly'
    } else {
      aggregation = 'daily'
    }
  }

  // Generate appropriate buckets
  let buckets: TrendBucket[] = []
  if (aggregation === 'monthly') {
    buckets = buildMonthlyBuckets(startDate, endDate, todayStr)
  } else if (aggregation === 'weekly') {
    buckets = buildWeeklyBuckets(startDate, endDate, todayStr)
  } else {
    buckets = buildDailyBuckets(startDate, endDate, todayStr)
  }

  // Filter completed sales within [startDate, endDate]
  // Rule: only completed sales are included, net of tax
  const completedSales = sales.filter((s) => {
    if (s.status !== 'completed') return false
    const saleDateStr = getSaleWibDate(s.created_at)
    return saleDateStr >= startDate && saleDateStr <= endDate
  })

  // Distribute sales into buckets
  for (const s of completedSales) {
    const saleDateStr = getSaleWibDate(s.created_at)
    const netAmount = Number(s.total) - Number(s.tax_amount || 0)

    for (const b of buckets) {
      if (saleDateStr >= b.startDate && saleDateStr <= b.endDate) {
        b.amount += netAmount
        b.count += 1
        break
      }
    }
  }

  const totalRevenue = buckets.reduce((sum, b) => sum + b.amount, 0)
  const totalCount = buckets.reduce((sum, b) => sum + b.count, 0)
  const maxAmount = Math.max(1, ...buckets.map((b) => b.amount))

  return {
    period,
    startDate,
    endDate,
    aggregation,
    buckets,
    totalRevenue,
    totalCount,
    maxAmount,
  }
}

