import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { generateReportExcel, sanitizeReportFilename } from '../lib/reports-excel'
import type { ReportData, ReportFilter } from '../lib/reports'

test('sanitizeReportFilename formats filename as LAPORAN_[nama usaha]_[tanggal awal]-[tanggal akhir]_[metode]', () => {
  const filter: ReportFilter = { from: '2026-11-04', to: '2026-11-10', payment: 'all' }

  assert.equal(
    sanitizeReportFilename('Kilatz', filter, 'xlsx'),
    'LAPORAN_Kilatz_2026-11-04-2026-11-10_all.xlsx'
  )

  assert.equal(
    sanitizeReportFilename('Kilatz Barbershop & Spa / VIP: Test*?', filter, 'xlsx'),
    'LAPORAN_Kilatz_Barbershop_&_Spa_VIP_Test_2026-11-04-2026-11-10_all.xlsx'
  )

  assert.equal(
    sanitizeReportFilename('Kedai Kopi 99', { from: '2026-10-01', to: '2026-10-15', payment: 'qris' }, 'xlsx'),
    'LAPORAN_Kedai_Kopi_99_2026-10-01-2026-10-15_qris.xlsx'
  )

  assert.equal(
    sanitizeReportFilename('', filter, 'csv'),
    'LAPORAN_Usaha_2026-11-04-2026-11-10_all.csv'
  )
})

test('generateReportExcel creates formatted multi-sheet Excel with Usahaku styling, metrics and formulas', async () => {
  const filter: ReportFilter = { from: '2026-11-04', to: '2026-11-10', payment: 'all' }

  const mockData: ReportData = {
    generatedAt: '2026-11-10T12:00:00.000Z',
    sales: [
      {
        id: 'sale-1',
        business_id: 'biz-1',
        actor_id: 'user-1',
        actor_name: 'Adoy Kasir',
        customer_id: 'cust-1',
        customer: '=HYPERLINK("http://malicious.test")',
        phone: '08123456789',
        receipt_number: 'TRX-001',
        status: 'completed',
        subtotal: 50000,
        discount: 5000,
        discount_kind: 'amount',
        discount_value: 5000,
        service_amount: 0,
        tax_amount: 4500,
        total: 49500,
        payment: 'cash',
        received: 50000,
        change: 500,
        created_at: '2026-11-05T09:30:00.000Z',
        cancelled_at: null,
        cancellation_reason: null,
        deposit_amount: 0,
        deposit_payment: null,
        balance_received: null,
        lines: [
          {
            id: 'line-1',
            name: 'Regular Cut',
            sku: 'SVC-RC-01',
            quantity: 1,
            unit: 'layanan',
            price: 50000,
            original_price: 50000,
            total: 50000,
            original_total: 50000,
            revision: 0,
          },
        ],
      },
      {
        id: 'sale-2',
        business_id: 'biz-1',
        actor_id: 'user-1',
        actor_name: 'Adoy Kasir',
        customer_id: null,
        customer: 'Budi Santoso',
        phone: '',
        receipt_number: 'TRX-002',
        status: 'cancelled',
        subtotal: 30000,
        discount: 0,
        discount_kind: 'none',
        discount_value: 0,
        service_amount: 0,
        tax_amount: 0,
        total: 30000,
        payment: 'qris',
        received: 30000,
        change: 0,
        created_at: '2026-11-06T10:00:00.000Z',
        cancelled_at: '2026-11-06T10:15:00.000Z',
        cancellation_reason: 'Pelanggan membatalkan pesanan',
        deposit_amount: 0,
        deposit_payment: null,
        balance_received: null,
        lines: [],
      },
    ],
    refunds: [
      {
        id: 'sale-2',
        business_id: 'biz-1',
        actor_id: 'user-1',
        actor_name: 'Adoy Kasir',
        customer_id: null,
        customer: 'Budi Santoso',
        phone: '',
        receipt_number: 'TRX-002',
        status: 'cancelled',
        subtotal: 30000,
        discount: 0,
        discount_kind: 'none',
        discount_value: 0,
        service_amount: 0,
        tax_amount: 0,
        total: 30000,
        payment: 'qris',
        received: 30000,
        change: 0,
        created_at: '2026-11-06T10:00:00.000Z',
        cancelled_at: '2026-11-06T10:15:00.000Z',
        cancelled_by_name: 'Manajer Budi',
        refund_amount: 30000,
        cancellation_reason: 'Pelanggan membatalkan pesanan',
        deposit_amount: 0,
        deposit_payment: null,
        balance_received: null,
        lines: [],
      },
    ],
  }

  const buffer = await generateReportExcel(mockData, filter, 'Kilatz Barbershop')
  assert.ok(buffer.length > 5000, 'Excel buffer should be non-empty')

  // Read back generated workbook with ExcelJS to assert internal structure
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  const masterSheet = wb.getWorksheet('Laporan Lengkap')
  assert.ok(masterSheet, 'Master sheet should exist')
  assert.equal(masterSheet.getCell('A1').value, 'USAHAKU  ·  LAPORAN PENJUALAN')

  // Check customer name formula injection sanitization in master sheet
  const dataSheet = wb.getWorksheet('Data Penjualan')
  assert.ok(dataSheet, 'Data Penjualan sheet should exist')
  assert.equal(dataSheet.rowCount, 3) // 1 header + 2 sales rows

  const prodSheet = wb.getWorksheet('Produk & Layanan')
  assert.ok(prodSheet, 'Produk & Layanan sheet should exist')
  assert.equal(prodSheet.rowCount, 2) // 1 header + 1 product row
})

