import { z } from 'zod'
import { reportMoney, reportSummary, reportUnits, wibDate, type ReportData, type ReportFilter } from './reports'

export const assistantRequest = z.object({
  question: z.string().trim().min(3, 'Tulis pertanyaan minimal 3 karakter.').max(600, 'Pertanyaan maksimal 600 karakter.'),
  period: z.enum(['today', '7d', '30d']),
  previousQuestions: z.array(z.string().trim().min(3).max(600)).max(3).default([]),
}).strict()
export type AssistantRequest = z.infer<typeof assistantRequest>
export type StockSnapshot = { id: string; name: string; unit: string; stock: number; minimum_stock: number; active: boolean }
export type Fact = { id: string; text: string; providerText: string }
export type AssistantContext = { filter: ReportFilter; generatedAt: string; stockAt: string; facts: Fact[]; advice: Record<string, string> }
export type AssistantAnswer = { title: string; facts: string[]; suggestions: string[]; from: string; to: string; generatedAt: string; stockAt: string; sources: string[] }
export const topics = ['overview', 'sales', 'products', 'stock', 'payments', 'unsupported'] as const
export type Selection = { topic: typeof topics[number]; factIds: string[]; adviceIds: string[] }

export function assistantFilter(period: AssistantRequest['period'], now = new Date()): ReportFilter {
  const days = period === 'today' ? 1 : period === '7d' ? 7 : 30
  return { from: wibDate(new Date(now.getTime() - (days - 1) * 86400000)), to: wibDate(now), payment: 'all' }
}

export function buildAssistantContext(data: ReportData, stock: StockSnapshot[], filter: ReportFilter, stockAt: string): AssistantContext {
  const s = reportSummary(data), facts: Fact[] = []
  const add = (id: string, text: string, providerText = text) => facts.push({ id, text, providerText })
  add('net', `Omzet penjualan selesai: ${reportMoney(s.net)}. Angka ini bukan laba.`)
  add('count', `Transaksi selesai: ${s.count.toLocaleString('id-ID')}.`)
  add('average', `Rata-rata transaksi selesai: ${reportMoney(s.average)}.`)
  add('discount', `Diskon pada penjualan selesai: ${reportMoney(s.discount)}.`)
  add('cancelled', `Penjualan dalam periode ini yang berstatus dibatalkan: ${s.cancelled.toLocaleString('id-ID')}. Omzet sudah mengecualikannya.`)
  add('refund', `Refund manual menurut tanggal pembatalan: ${reportMoney(s.refund)}. Ditampilkan terpisah, tidak dikurangi lagi dari omzet.`)
  for (const method of ['cash', 'qris', 'transfer'] as const) {
    const part = reportSummary({ ...data, sales: data.sales.filter(sale => sale.payment === method), refunds: [] })
    const label = { cash: 'Tunai', qris: 'QRIS', transfer: 'Transfer' }[method]
    add(method, `${label}: ${part.count.toLocaleString('id-ID')} transaksi selesai, omzet ${reportMoney(part.net)}. Pembayaran dicatat manual.`)
  }
  const best = [...s.best].sort((a, b) => a.gross === b.gross ? a.id.localeCompare(b.id) : a.gross > b.gross ? -1 : 1).slice(0, 5)
  best.forEach((p, i) => {
    const value = `${reportUnits(p.quantity)} ${p.unit}; nilai barang sebelum diskon transaksi ${reportMoney(p.gross)}.`
    add(`product_${i}`, `${p.name}: ${value}`, `Produk peringkat ${i + 1} menurut nilai sebelum diskon: ${reportUnits(p.quantity)} satuan produk; nilai ${reportMoney(p.gross)}.`)
  })
  const active = stock.filter(p => p.active), low = active.filter(p => Number(p.stock) <= Number(p.minimum_stock)).sort((a, b) => Number(a.stock) - Number(b.stock) || a.id.localeCompare(b.id))
  add('stock_count', `Produk aktif saat data stok dibaca: ${active.length.toLocaleString('id-ID')}; mencapai atau di bawah minimum: ${low.length.toLocaleString('id-ID')}.`)
  low.slice(0, 5).forEach((p, i) => add(`stock_${i}`, `${p.name}: stok ${Number(p.stock).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${p.unit}, minimum ${Number(p.minimum_stock).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${p.unit}.`, `Produk stok rendah ${i + 1}: stok ${p.stock}, minimum ${p.minimum_stock}, dalam satuan produk yang sama.`))
  if (!s.count) add('empty_sales', 'Belum ada penjualan selesai pada periode yang dipilih. Belum cukup data untuk menyimpulkan pola penjualan.')
  if (!active.length) add('empty_stock', 'Belum ada produk aktif. Tambahkan produk dan stok sebelum memakai analisis stok.')
  const advice: Record<string, string> = {}
  if (s.count) advice.review_sales = 'Tinjau rincian transaksi di Laporan sebelum menentukan promosi. Data ini belum membuktikan penyebab naik atau turunnya penjualan.'
  if (best.length) advice.review_products = 'Periksa produk dengan nilai penjualan tinggi bersama jumlah terjual dan satuannya. Nilai tersebut belum memperhitungkan diskon total transaksi atau harga modal.'
  if (low.length) advice.check_stock = 'Periksa stok fisik produk yang mencapai batas minimum sebelum merencanakan pembelian. Asisten tidak mengubah stok atau membuat pesanan.'
  if (!s.count) advice.collect_sales = 'Catat penjualan yang benar-benar terjadi melalui POS, lalu pilih periode yang memiliki transaksi untuk melihat ringkasannya.'
  if (!active.length) advice.add_products = 'Lengkapi katalog dan stok awal melalui Produk. Jangan memasukkan transaksi contoh ke data usaha yang dipakai sehari-hari.'
  if (s.refund > BigInt(0)) advice.review_refunds = 'Cocokkan pembatalan dengan pengembalian barang dan bukti refund manual. Aplikasi tidak mengirim refund otomatis.'
  return { filter, generatedAt: data.generatedAt, stockAt, facts, advice }
}

export function validateSelection(value: unknown, context: AssistantContext): Selection {
  const parsed = z.object({ topic: z.enum(topics), factIds: z.array(z.string()).max(8), adviceIds: z.array(z.string()).max(3) }).strict().parse(value)
  if (parsed.factIds.some(id => !context.facts.some(f => f.id === id)) || parsed.adviceIds.some(id => !Object.hasOwn(context.advice, id))) throw Error('Unknown evidence')
  if (new Set(parsed.factIds).size !== parsed.factIds.length || new Set(parsed.adviceIds).size !== parsed.adviceIds.length) throw Error('Duplicate evidence')
  if (parsed.topic !== 'unsupported' && !parsed.factIds.length) throw Error('Missing evidence')
  return parsed
}

export function renderAssistantAnswer(selection: Selection, context: AssistantContext): AssistantAnswer {
  const titles = { overview: 'Ringkasan usaha pada periode pilihan', sales: 'Ringkasan penjualan', products: 'Produk dengan nilai penjualan tertinggi', stock: 'Kondisi stok saat ini', payments: 'Ringkasan pembayaran manual', unsupported: 'Pertanyaan ini belum didukung' }
  const unsupported = selection.topic === 'unsupported'
  return {
    title: titles[selection.topic],
    facts: unsupported ? ['Asisten saat ini membantu ringkasan penjualan, pembayaran manual, produk terlaris, dan stok. Belum mendukung laba/HPP, prediksi, perbandingan periode, data pelanggan/staf, atau perubahan data usaha. Periode yang digunakan mengikuti pilihan di formulir.'] : selection.factIds.map(id => context.facts.find(f => f.id === id)!.text),
    suggestions: unsupported ? [] : selection.adviceIds.map(id => context.advice[id]),
    from: context.filter.from, to: context.filter.to, generatedAt: context.generatedAt, stockAt: context.stockAt,
    sources: unsupported ? [] : [...new Set(selection.factIds.map(id => /^(stock_|empty_stock)/.test(id) ? 'Inventori saat ini' : 'Laporan penjualan periode pilihan'))],
  }
}
