import ExcelJS from 'exceljs'
import type { ReportData, ReportFilter } from './reports'
import { rankProducts, reportPayment, reportSummary, reportUnits } from './reports'
import { paymentLabel, paymentMethods, saleCode, saleDate } from './pos'

export function sanitizeReportFilename(businessName: string, filter: ReportFilter, ext: 'xlsx' | 'csv' = 'xlsx'): string {
  const safeName = (businessName || 'Usaha')
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\s+/g, '_')
  return `LAPORAN_${safeName}_${filter.from}-${filter.to}_${filter.payment}.${ext}`
}

const BRAND_BLUE = '1835D9'
const DARK_SLATE = '1E293B'
const ACCENT_CYAN = '24CBC5'
const BORDER_COLOR = 'CBD5E1'
const ZEBRA_BG = 'F8FAFC'
const CARD_BG = 'EFF6FF'
const CARD_BORDER = 'BFDBFE'

export async function generateReportExcel(
  data: ReportData,
  filter: ReportFilter,
  businessName: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Usahaku POS & Bisnis'
  wb.created = new Date()
  wb.modified = new Date()

  const summary = reportSummary(data)
  const products = rankProducts(data, 'gross')

  // ----------------------------------------------------
  // SHEET 1: LAPORAN LENGKAP (MASTER REPORT)
  // ----------------------------------------------------
  const wsMaster = wb.addWorksheet('Laporan Lengkap', {
    views: [{ showGridLines: true }],
  })

  // Set explicit column widths for Master
  wsMaster.columns = [
    { key: 'A', width: 6 },   // No
    { key: 'B', width: 22 },  // Referensi / Kode
    { key: 'C', width: 20 },  // Tanggal WIB
    { key: 'D', width: 18 },  // Kasir
    { key: 'E', width: 20 },  // Pelanggan
    { key: 'F', width: 14 },  // Metode
    { key: 'G', width: 14 },  // Status
    { key: 'H', width: 16 },  // Subtotal
    { key: 'I', width: 14 },  // Diskon
    { key: 'J', width: 14 },  // Layanan
    { key: 'K', width: 14 },  // Pajak
    { key: 'L', width: 16 },  // Total
    { key: 'M', width: 16 },  // Omzet Diakui
  ]

  // Header Banner (Rows 1-2)
  wsMaster.mergeCells('A1:M2')
  const bannerCell = wsMaster.getCell('A1')
  bannerCell.value = 'USAHAKU  ·  LAPORAN PENJUALAN'
  bannerCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
  bannerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + BRAND_BLUE } }
  bannerCell.alignment = { vertical: 'middle', horizontal: 'center' }

  // Info Block (Rows 4-7)
  const metaLabels = [
    ['Nama Usaha', businessName],
    ['Periode Laporan', `${filter.from} s.d. ${filter.to} (WIB)`],
    ['Metode Pembayaran', reportPayment(filter)],
    ['Waktu Pengambilan Data', `${saleDate(data.generatedAt)} WIB`],
  ]

  let currentRow = 4
  for (const [lbl, val] of metaLabels) {
    const lblCell = wsMaster.getCell(`B${currentRow}`)
    const valCell = wsMaster.getCell(`C${currentRow}`)
    wsMaster.mergeCells(`C${currentRow}:F${currentRow}`)

    lblCell.value = lbl
    lblCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } }
    
    valCell.value = val
    valCell.font = { name: 'Calibri', size: 11, bold: currentRow === 4, color: { argb: 'FF0F172A' } }
    currentRow++
  }

  currentRow += 1 // blank space

  // ----------------------------------------------------
  // KPI Metric Cards (Rows 9-11)
  // ----------------------------------------------------
  const kpis = [
    { title: 'OMZET SELESAI', val: Number(summary.net), fmt: '"Rp"#,##0', note: 'Setelah diskon & tanpa pajak', cols: ['B', 'C'] },
    { title: 'TRANSAKSI SELESAI', val: summary.count, fmt: '#,##0', note: `Rata-rata Rp${summary.average.toLocaleString('id-ID')}`, cols: ['E', 'F'] },
    { title: 'UNIT TERJUAL', val: reportUnits(summary.units), fmt: '@', note: 'Gabungan jumlah satuan', cols: ['H', 'I'] },
    { title: 'TOTAL REFUND', val: Number(summary.refund), fmt: '"Rp"#,##0', note: `${data.refunds.length} transaksi dibatalkan`, cols: ['K', 'L'] },
  ]

  const titleRowIdx = currentRow
  const valRowIdx = currentRow + 1
  const noteRowIdx = currentRow + 2

  wsMaster.getRow(titleRowIdx).height = 18
  wsMaster.getRow(valRowIdx).height = 28
  wsMaster.getRow(noteRowIdx).height = 16

  for (const kpi of kpis) {
    const [c1, c2] = kpi.cols
    wsMaster.mergeCells(`${c1}${titleRowIdx}:${c2}${titleRowIdx}`)
    wsMaster.mergeCells(`${c1}${valRowIdx}:${c2}${valRowIdx}`)
    wsMaster.mergeCells(`${c1}${noteRowIdx}:${c2}${noteRowIdx}`)

    const tCell = wsMaster.getCell(`${c1}${titleRowIdx}`)
    tCell.value = kpi.title
    tCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF1E40AF' } }
    tCell.alignment = { vertical: 'middle', horizontal: 'center' }

    const vCell = wsMaster.getCell(`${c1}${valRowIdx}`)
    vCell.value = kpi.val
    vCell.numFmt = kpi.fmt
    vCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF0F172A' } }
    vCell.alignment = { vertical: 'middle', horizontal: 'center' }

    const nCell = wsMaster.getCell(`${c1}${noteRowIdx}`)
    nCell.value = kpi.note
    nCell.font = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FF64748B' } }
    nCell.alignment = { vertical: 'middle', horizontal: 'center' }

    // Box borders and backgrounds
    for (let r = titleRowIdx; r <= noteRowIdx; r++) {
      for (const col of [c1, c2]) {
        const cell = wsMaster.getCell(`${col}${r}`)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + CARD_BG } }
        cell.border = {
          top: r === titleRowIdx ? { style: 'thin', color: { argb: 'FF' + CARD_BORDER } } : undefined,
          bottom: r === noteRowIdx ? { style: 'thin', color: { argb: 'FF' + CARD_BORDER } } : undefined,
          left: col === c1 ? { style: 'thin', color: { argb: 'FF' + CARD_BORDER } } : undefined,
          right: col === c2 ? { style: 'thin', color: { argb: 'FF' + CARD_BORDER } } : undefined,
        }
      }
    }
  }

  currentRow = noteRowIdx + 2

  // ----------------------------------------------------
  // SECTION: RINGKASAN METODE PEMBAYARAN
  // ----------------------------------------------------
  const paySectionCell = wsMaster.getCell(`B${currentRow}`)
  paySectionCell.value = 'RINGKASAN METODE PEMBAYARAN'
  paySectionCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF' + DARK_SLATE } }
  currentRow++

  const payHeaders = ['Metode Pembayaran', 'Transaksi Selesai', 'Omzet Selesai', 'Total Diskon']
  const payCols = ['B', 'C', 'D', 'E']

  wsMaster.getRow(currentRow).height = 24
  payHeaders.forEach((h, i) => {
    const c = wsMaster.getCell(`${payCols[i]}${currentRow}`)
    c.value = h
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + BRAND_BLUE } }
    c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right' }
    c.border = {
      top: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
      bottom: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
      left: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
      right: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
    }
  })
  currentRow++

  for (const m of paymentMethods) {
    if (filter.payment !== 'all' && filter.payment !== m) continue
    const part = reportSummary({ ...data, sales: data.sales.filter(s => s.payment === m), refunds: [] })
    const row = wsMaster.getRow(currentRow)
    row.height = 20

    const cells = [
      wsMaster.getCell(`B${currentRow}`),
      wsMaster.getCell(`C${currentRow}`),
      wsMaster.getCell(`D${currentRow}`),
      wsMaster.getCell(`E${currentRow}`),
    ]

    cells[0].value = paymentLabel[m]
    cells[0].alignment = { vertical: 'middle', horizontal: 'left' }

    cells[1].value = part.count
    cells[1].numFmt = '#,##0'
    cells[1].alignment = { vertical: 'middle', horizontal: 'right' }

    cells[2].value = Number(part.net)
    cells[2].numFmt = '"Rp"#,##0'
    cells[2].alignment = { vertical: 'middle', horizontal: 'right' }

    cells[3].value = Number(part.discount)
    cells[3].numFmt = '"Rp"#,##0'
    cells[3].alignment = { vertical: 'middle', horizontal: 'right' }

    cells.forEach(c => {
      c.font = { name: 'Calibri', size: 10 }
      c.border = {
        top: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
        bottom: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
        left: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
        right: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
      }
    })
    currentRow++
  }

  currentRow += 2

  // ----------------------------------------------------
  // SECTION: RINCIAN TRANSAKSI PENJUALAN
  // ----------------------------------------------------
  const salesSectionCell = wsMaster.getCell(`B${currentRow}`)
  salesSectionCell.value = 'RINCIAN TRANSAKSI PENJUALAN'
  salesSectionCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF' + DARK_SLATE } }
  currentRow++

  const salesHeaders = [
    'No', 'Referensi', 'Tanggal (WIB)', 'Kasir', 'Pelanggan', 'Metode', 'Status',
    'Subtotal', 'Diskon', 'Biaya Layanan', 'Pajak', 'Total Transaksi', 'Omzet Diakui'
  ]
  const salesColKeys = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']

  wsMaster.getRow(currentRow).height = 26
  salesHeaders.forEach((h, i) => {
    const c = wsMaster.getCell(`${salesColKeys[i]}${currentRow}`)
    c.value = h
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + BRAND_BLUE } }
    c.alignment = { vertical: 'middle', horizontal: ['Subtotal', 'Diskon', 'Biaya Layanan', 'Pajak', 'Total Transaksi', 'Omzet Diakui'].includes(h) ? 'right' : 'center' }
    c.border = {
      top: { style: 'medium', color: { argb: 'FF' + BRAND_BLUE } },
      bottom: { style: 'medium', color: { argb: 'FF' + BRAND_BLUE } },
      left: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
      right: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
    }
  })

  const salesTableStartRow = currentRow + 1
  currentRow++

  if (data.sales.length === 0) {
    wsMaster.mergeCells(`B${currentRow}:M${currentRow}`)
    const emptyCell = wsMaster.getCell(`B${currentRow}`)
    emptyCell.value = 'Belum ada transaksi pada periode ini.'
    emptyCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF94A3B8' } }
    emptyCell.alignment = { vertical: 'middle', horizontal: 'center' }
    currentRow++
  } else {
    data.sales.forEach((s, idx) => {
      const isZebra = idx % 2 === 1
      const isCompleted = s.status === 'completed'
      const recognizedOmzet = isCompleted ? Number(s.total) - Number(s.tax_amount || 0) : 0
      const row = wsMaster.getRow(currentRow)
      row.height = 21

      const values: [string, any, string, 'left' | 'center' | 'right'][] = [
        ['A', idx + 1, '#,##0', 'center'],
        ['B', saleCode(s), '@', 'left'],
        ['C', saleDate(s.created_at), '@', 'center'],
        ['D', s.actor_name, '@', 'left'],
        ['E', s.customer || '-', '@', 'left'],
        ['F', paymentLabel[s.payment], '@', 'center'],
        ['G', isCompleted ? 'Selesai' : 'Dibatalkan', '@', 'center'],
        ['H', Number(s.subtotal), '"Rp"#,##0', 'right'],
        ['I', Number(s.discount), '"Rp"#,##0', 'right'],
        ['J', Number(s.service_amount || 0), '"Rp"#,##0', 'right'],
        ['K', Number(s.tax_amount || 0), '"Rp"#,##0', 'right'],
        ['L', Number(s.total), '"Rp"#,##0', 'right'],
        ['M', recognizedOmzet, '"Rp"#,##0', 'right'],
      ]

      values.forEach(([col, val, fmt, align]) => {
        const c = wsMaster.getCell(`${col}${currentRow}`)
        c.value = val
        c.numFmt = fmt
        c.font = { name: 'Calibri', size: 10, color: { argb: isCompleted ? 'FF0F172A' : 'FF64748B' } }
        c.alignment = { vertical: 'middle', horizontal: align }
        c.border = {
          top: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
          bottom: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
          left: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
          right: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
        }

        if (col === 'G') {
          c.font = {
            name: 'Calibri',
            size: 9,
            bold: true,
            color: { argb: isCompleted ? 'FF166534' : 'FF991B1B' },
          }
          c.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: isCompleted ? 'FFDCFCE7' : 'FFFEE2E2' },
          }
        } else if (isZebra) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + ZEBRA_BG } }
        }
      })

      currentRow++
    })

    // Total Row
    const salesTableEndRow = currentRow - 1
    const totalRow = wsMaster.getRow(currentRow)
    totalRow.height = 24

    wsMaster.mergeCells(`A${currentRow}:G${currentRow}`)
    const totalLbl = wsMaster.getCell(`A${currentRow}`)
    totalLbl.value = 'TOTAL KESELURUHAN'
    totalLbl.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
    totalLbl.alignment = { vertical: 'middle', horizontal: 'center' }

    const numCols = [
      ['H', 'subtotal'],
      ['I', 'diskon'],
      ['J', 'layanan'],
      ['K', 'pajak'],
      ['L', 'total'],
      ['M', 'omzet'],
    ]

    for (const [col] of numCols) {
      const c = wsMaster.getCell(`${col}${currentRow}`)
      c.value = { formula: `SUM(${col}${salesTableStartRow}:${col}${salesTableEndRow})` }
      c.numFmt = '"Rp"#,##0'
      c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
      c.alignment = { vertical: 'middle', horizontal: 'right' }
    }

    for (const col of salesColKeys) {
      const c = wsMaster.getCell(`${col}${currentRow}`)
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
      c.border = {
        top: { style: 'thin', color: { argb: 'FF' + DARK_SLATE } },
        bottom: { style: 'double', color: { argb: 'FF' + DARK_SLATE } },
        left: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
        right: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
      }
    }
    currentRow++
  }

  currentRow += 2

  // ----------------------------------------------------
  // SECTION: PRODUK & LAYANAN TERLARIS
  // ----------------------------------------------------
  const prodSectionCell = wsMaster.getCell(`B${currentRow}`)
  prodSectionCell.value = 'PRODUK & LAYANAN TERLARIS'
  prodSectionCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF' + DARK_SLATE } }
  currentRow++

  const prodHeaders = ['No', 'Nama Produk / Layanan', 'SKU', 'Satuan', 'Jumlah Terjual', 'Nilai Penjualan']
  const prodColKeys = ['B', 'C', 'D', 'E', 'F', 'G']

  wsMaster.getRow(currentRow).height = 24
  prodHeaders.forEach((h, i) => {
    const c = wsMaster.getCell(`${prodColKeys[i]}${currentRow}`)
    c.value = h
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + BRAND_BLUE } }
    c.alignment = { vertical: 'middle', horizontal: ['Jumlah Terjual', 'Nilai Penjualan'].includes(h) ? 'right' : 'center' }
    c.border = {
      top: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
      bottom: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
      left: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
      right: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
    }
  })
  currentRow++

  if (products.length === 0) {
    wsMaster.mergeCells(`B${currentRow}:G${currentRow}`)
    const emptyCell = wsMaster.getCell(`B${currentRow}`)
    emptyCell.value = 'Belum ada produk atau layanan terjual pada periode ini.'
    emptyCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF94A3B8' } }
    emptyCell.alignment = { vertical: 'middle', horizontal: 'center' }
    currentRow++
  } else {
    products.forEach((p, idx) => {
      const isZebra = idx % 2 === 1
      const row = wsMaster.getRow(currentRow)
      row.height = 20

      const cells = [
        wsMaster.getCell(`B${currentRow}`),
        wsMaster.getCell(`C${currentRow}`),
        wsMaster.getCell(`D${currentRow}`),
        wsMaster.getCell(`E${currentRow}`),
        wsMaster.getCell(`F${currentRow}`),
        wsMaster.getCell(`G${currentRow}`),
      ]

      cells[0].value = idx + 1
      cells[0].alignment = { vertical: 'middle', horizontal: 'center' }

      cells[1].value = p.name
      cells[1].alignment = { vertical: 'middle', horizontal: 'left' }

      cells[2].value = p.sku || '-'
      cells[2].alignment = { vertical: 'middle', horizontal: 'center' }

      cells[3].value = p.unit
      cells[3].alignment = { vertical: 'middle', horizontal: 'center' }

      cells[4].value = reportUnits(p.quantity)
      cells[4].alignment = { vertical: 'middle', horizontal: 'right' }

      cells[5].value = Number(p.gross)
      cells[5].numFmt = '"Rp"#,##0'
      cells[5].alignment = { vertical: 'middle', horizontal: 'right' }

      cells.forEach(c => {
        c.font = { name: 'Calibri', size: 10 }
        c.border = {
          top: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
          bottom: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
          left: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
          right: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
        }
        if (isZebra) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + ZEBRA_BG } }
        }
      })
      currentRow++
    })
  }

  currentRow += 2

  // ----------------------------------------------------
  // SECTION: REFUND & PEMBATALAN (IF ANY)
  // ----------------------------------------------------
  if (data.refunds.length > 0) {
    const refundSectionCell = wsMaster.getCell(`B${currentRow}`)
    refundSectionCell.value = 'PEMBATALAN & REFUND MANUAL PADA PERIODE INI'
    refundSectionCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF991B1B' } }
    currentRow++

    const refundHeaders = ['Referensi', 'Tgl Penjualan (WIB)', 'Tgl Pembatalan (WIB)', 'Petugas', 'Pelanggan', 'Metode', 'Refund Manual', 'Alasan']
    const refundCols = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']

    wsMaster.getRow(currentRow).height = 24
    refundHeaders.forEach((h, i) => {
      const c = wsMaster.getCell(`${refundCols[i]}${currentRow}`)
      c.value = h
      c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991B1B' } }
      c.alignment = { vertical: 'middle', horizontal: h === 'Refund Manual' ? 'right' : 'center' }
      c.border = {
        top: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
        bottom: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
        left: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
        right: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
      }
    })
    currentRow++

    data.refunds.forEach((r, idx) => {
      const isZebra = idx % 2 === 1
      const row = wsMaster.getRow(currentRow)
      row.height = 20

      const cells = [
        wsMaster.getCell(`B${currentRow}`),
        wsMaster.getCell(`C${currentRow}`),
        wsMaster.getCell(`D${currentRow}`),
        wsMaster.getCell(`E${currentRow}`),
        wsMaster.getCell(`F${currentRow}`),
        wsMaster.getCell(`G${currentRow}`),
        wsMaster.getCell(`H${currentRow}`),
        wsMaster.getCell(`I${currentRow}`),
      ]

      cells[0].value = saleCode(r)
      cells[1].value = saleDate(r.created_at)
      cells[2].value = r.cancelled_at ? saleDate(r.cancelled_at) : '-'
      cells[3].value = r.cancelled_by_name || '-'
      cells[4].value = r.customer || '-'
      cells[5].value = paymentLabel[r.payment]
      cells[6].value = Number(r.refund_amount || 0)
      cells[6].numFmt = '"Rp"#,##0'
      cells[7].value = r.cancellation_reason || '-'

      cells.forEach((c, i) => {
        c.font = { name: 'Calibri', size: 10 }
        c.alignment = { vertical: 'middle', horizontal: i === 6 ? 'right' : i === 7 ? 'left' : 'center' }
        c.border = {
          top: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
          bottom: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
          left: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
          right: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
        }
        if (isZebra) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + ZEBRA_BG } }
        }
      })
      currentRow++
    })

    currentRow += 2
  }

  // ----------------------------------------------------
  // SECTION: CATATAN
  // ----------------------------------------------------
  wsMaster.mergeCells(`B${currentRow}:M${currentRow + 1}`)
  const noteCell = wsMaster.getCell(`B${currentRow}`)
  noteCell.value = 'Catatan: Omzet dihitung dari transaksi selesai setelah dikurangi diskon & pajak (termasuk biaya layanan jika ada). Total transaksi pada struk sudah termasuk pajak. Omzet mengecualikan transaksi yang dibatalkan. Nilai uang dalam Rupiah (Rp).'
  noteCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } }
  noteCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }

  // ----------------------------------------------------
  // SHEET 2: DATA PENJUALAN (TABLE DEDICATED WITH AUTOFILTER)
  // ----------------------------------------------------
  const wsData = wb.addWorksheet('Data Penjualan', {
    views: [{ showGridLines: true }],
  })

  wsData.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'Kode Referensi', key: 'ref', width: 22 },
    { header: 'Tanggal (WIB)', key: 'date', width: 22 },
    { header: 'Kasir / Petugas', key: 'cashier', width: 20 },
    { header: 'Pelanggan', key: 'customer', width: 22 },
    { header: 'Metode Pembayaran', key: 'payment', width: 18 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Subtotal (Rp)', key: 'subtotal', width: 18 },
    { header: 'Diskon (Rp)', key: 'discount', width: 16 },
    { header: 'Biaya Layanan (Rp)', key: 'service', width: 18 },
    { header: 'Pajak (Rp)', key: 'tax', width: 16 },
    { header: 'Total Transaksi (Rp)', key: 'total', width: 20 },
    { header: 'Omzet Diakui (Rp)', key: 'omzet', width: 20 },
  ]

  const headerRow = wsData.getRow(1)
  headerRow.height = 26
  headerRow.eachCell(cell => {
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + BRAND_BLUE } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  data.sales.forEach((s, idx) => {
    const isCompleted = s.status === 'completed'
    const recognizedOmzet = isCompleted ? Number(s.total) - Number(s.tax_amount || 0) : 0
    const row = wsData.addRow({
      no: idx + 1,
      ref: saleCode(s),
      date: saleDate(s.created_at),
      cashier: s.actor_name,
      customer: s.customer || '-',
      payment: paymentLabel[s.payment],
      status: isCompleted ? 'Selesai' : 'Dibatalkan',
      subtotal: Number(s.subtotal),
      discount: Number(s.discount),
      service: Number(s.service_amount || 0),
      tax: Number(s.tax_amount || 0),
      total: Number(s.total),
      omzet: recognizedOmzet,
    })

    row.height = 20
    const isZebra = idx % 2 === 1

    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Calibri', size: 10 }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
        bottom: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
        left: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
        right: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
      }

      if (colNum >= 8) {
        cell.numFmt = '"Rp"#,##0'
        cell.alignment = { vertical: 'middle', horizontal: 'right' }
      } else if (colNum === 1 || colNum === 3 || colNum === 6 || colNum === 7) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' }
      }

      if (colNum === 7) {
        cell.font = {
          name: 'Calibri',
          size: 9,
          bold: true,
          color: { argb: isCompleted ? 'FF166534' : 'FF991B1B' },
        }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isCompleted ? 'FFDCFCE7' : 'FFFEE2E2' },
        }
      } else if (isZebra) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + ZEBRA_BG } }
      }
    })
  })

  // Auto filter for Data Penjualan
  if (data.sales.length > 0) {
    wsData.autoFilter = {
      from: 'A1',
      to: `M${data.sales.length + 1}`,
    }
  }

  // ----------------------------------------------------
  // SHEET 3: PRODUK & LAYANAN TERLARIS (DEDICATED TABLE)
  // ----------------------------------------------------
  const wsProd = wb.addWorksheet('Produk & Layanan', {
    views: [{ showGridLines: true }],
  })

  wsProd.columns = [
    { header: 'Peringkat', key: 'rank', width: 10 },
    { header: 'Nama Produk / Layanan', key: 'name', width: 28 },
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Satuan', key: 'unit', width: 12 },
    { header: 'Jumlah Terjual', key: 'qty', width: 16 },
    { header: 'Total Nilai (Rp)', key: 'gross', width: 20 },
  ]

  const prodHeaderRow = wsProd.getRow(1)
  prodHeaderRow.height = 26
  prodHeaderRow.eachCell(cell => {
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + BRAND_BLUE } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  products.forEach((p, idx) => {
    const row = wsProd.addRow({
      rank: idx + 1,
      name: p.name,
      sku: p.sku || '-',
      unit: p.unit,
      qty: reportUnits(p.quantity),
      gross: Number(p.gross),
    })

    row.height = 20
    const isZebra = idx % 2 === 1

    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Calibri', size: 10 }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
        bottom: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
        left: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
        right: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
      }

      if (colNum === 6) {
        cell.numFmt = '"Rp"#,##0'
        cell.alignment = { vertical: 'middle', horizontal: 'right' }
      } else if (colNum === 5) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' }
      } else if (colNum === 1 || colNum === 3 || colNum === 4) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' }
      }

      if (isZebra) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + ZEBRA_BG } }
      }
    })
  })

  if (products.length > 0) {
    wsProd.autoFilter = {
      from: 'A1',
      to: `F${products.length + 1}`,
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

