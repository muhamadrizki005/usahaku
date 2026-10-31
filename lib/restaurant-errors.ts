import type { RestaurantResult } from './restaurant'

type RestaurantError = { code?: string; message?: string; details?: string } | null | undefined
type Operation = 'menu' | 'table' | 'order' | 'payment' | 'cancel' | 'refund'
const money = (value: number) => `Rp${value.toLocaleString('id-ID')}`
const validCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1000
const validMoney = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 999999999999

function reasonMessage(error: RestaurantError): string | null {
  if (!error || !['PT409', '22023'].includes(error.code || '') || !error.details || error.details.length > 2048) return null
  let detail: Record<string, unknown>
  try { detail = JSON.parse(error.details); if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null } catch { return null }
  const messages: Record<string, string> = {
    table_missing: 'Meja yang dipilih sudah tidak tersedia. Muat ulang daftar meja dan pilih meja lain.',
    table_inactive: 'Meja yang dipilih sedang nonaktif. Pilih meja lain atau minta owner/admin mengaktifkannya.',
    table_occupied: 'Meja ini sedang terpakai oleh pesanan yang belum dibayar. Pilih meja lain atau selesaikan pesanan tersebut.',
    table_busy_deactivate: 'Meja masih memiliki pesanan yang belum dibayar, sehingga belum bisa dinonaktifkan. Selesaikan atau batalkan pesanan terlebih dahulu.',
    menu_missing: 'Menu yang dipilih sudah tidak tersedia. Muat ulang daftar menu dan pilih menu lain.',
    menu_inactive: 'Menu yang dipilih sudah dinonaktifkan. Pilih menu lain atau minta owner/admin mengaktifkannya.',
    order_paid: 'Pesanan ini sudah dibayar. Buka Transaksi untuk melihat struknya; jangan mencatat pembayaran lagi.',
    order_cancelled: 'Pesanan ini sudah dibatalkan dan tidak dapat diubah atau dibayar. Buat pesanan baru jika diperlukan.',
    order_revision: 'Pesanan telah diperbarui oleh petugas atau tab lain. Tutup formulir, muat ulang, lalu periksa perubahan sebelum menyimpan.',
    order_changed: 'Status pesanan telah berubah. Muat ulang pesanan sebelum melanjutkan.',
    payment_limit: 'Nominal pembayaran melebihi batas Rp999.999.999.999.',
  }
  if (typeof detail.reason !== 'string') return null
  if (Object.hasOwn(messages, detail.reason)) return messages[detail.reason]
  if (detail.reason === 'table_capacity' && validCount(detail.capacity) && validCount(detail.guests) && detail.guests > detail.capacity) return `Meja ini hanya muat ${detail.capacity} orang, sedangkan jumlah tamu ${detail.guests} orang. Kurangi jumlah tamu atau pilih meja yang lebih besar.`
  if (detail.reason === 'table_busy_capacity' && validCount(detail.capacity) && validCount(detail.guests) && detail.guests > detail.capacity) return `Meja sedang dipakai oleh ${detail.guests} tamu. Kapasitas tidak bisa diubah menjadi ${detail.capacity} orang sebelum pesanan selesai atau dibatalkan.`
  if (detail.reason === 'menu_out' && typeof detail.name === 'string' && detail.name.trim().length >= 1 && detail.name.length <= 100) return `Menu "${detail.name}" sedang habis. Hapus menu tersebut dari tambahan pesanan atau pilih menu lain.`
  if (detail.reason === 'payment_short' && validMoney(detail.received) && validMoney(detail.total) && detail.received < detail.total) return `Uang diterima ${money(detail.received)}, sedangkan total ${money(detail.total)}. Pembayaran masih kurang ${money(detail.total - detail.received)}.`
  if (detail.reason === 'payment_exact' && validMoney(detail.total)) return `Pembayaran QRIS/transfer harus sesuai total ${money(detail.total)}. Periksa nominal yang diterima sebelum mengonfirmasi.`
  return null
}

export function restaurantFailure(input: RestaurantError | string, operation: Operation = 'order'): RestaurantResult {
  const error = typeof input === 'string' ? { code: input } : input
  const code = error?.code || '', message = error?.message || ''
  if (code === '42501') return { error: message === 'Discount access denied' ? 'Diskon hanya dapat diberikan oleh owner atau admin.' : 'Anda tidak memiliki izin untuk melakukan tindakan ini.', uncertain: false }
  const specific = reasonMessage(error)
  if (specific) return { error: specific, uncertain: false }
  const known: Record<string, string> = {
    'Table already occupied': 'Meja ini sedang terpakai oleh pesanan yang belum dibayar. Pilih meja lain atau selesaikan pesanan tersebut.',
    'Menu changed; reload': 'Menu telah diperbarui di tab lain. Tutup editor dan muat ulang sebelum menyimpan.',
    'Table changed; reload': 'Data meja telah diperbarui di tab lain. Tutup editor dan muat ulang sebelum menyimpan.',
    'Order changed; reload': 'Pesanan telah diperbarui atau ditutup. Muat ulang pesanan sebelum melanjutkan.',
    'Menu missing; reload': 'Menu sudah tidak tersedia. Tutup editor dan muat ulang daftar menu.',
    'Table missing; reload': 'Meja sudah tidak tersedia. Tutup editor dan muat ulang daftar meja.',
    'Order missing; reload': 'Pesanan sudah tidak tersedia. Muat ulang daftar pesanan.',
    'Menu unavailable': 'Menu yang dipilih tidak tersedia untuk ditambahkan. Muat ulang daftar menu dan pilih menu yang aktif serta tersedia.',
    'Invalid order stage': 'Proses pesanan tidak boleh dimundurkan. Pesanan baru harus dimulai dari proses Baru.',
    'Duplicate menu item': 'Menu yang sama dimasukkan lebih dari sekali. Gabungkan jumlahnya dalam satu baris.',
    'Invalid menu quantity': 'Jumlah menu harus berupa porsi utuh, minimal 1 dan maksimal 9.999 per baris.',
    'Takeaway has no table': 'Pesanan bawa pulang tidak memakai meja. Kosongkan pilihan meja.',
    'Total exceeds limit': 'Total pesanan melebihi Rp999.999.999.999. Kurangi jumlah menu sebelum menyimpan.',
    'Invalid discount': 'Diskon nominal harus berupa rupiah bulat; diskon persen maksimal 100%.',
    'Discount exceeds subtotal': 'Nilai diskon melebihi subtotal pesanan. Kurangi diskonnya.',
    'Invalid received amount': 'Nominal pembayaran belum sesuai total pesanan. Periksa uang diterima sebelum mengonfirmasi.',
    'Invalid payment': 'Periksa metode, nominal pembayaran, diskon, dan konfirmasi bahwa dana sudah diterima.',
    'Cancellation reason required': 'Isi alasan pembatalan sebanyak 3 sampai 300 karakter.',
    'Confirm cancellation and manual refund': 'Isi alasan dan konfirmasi pembatalan seluruh pesanan serta pengembalian dana secara manual.',
    'Request ID already used': 'Permintaan ini sudah dipakai untuk data yang berbeda. Tutup formulir dan periksa data tersimpan sebelum mencoba lagi.',
  }
  if (['PT409', '22023'].includes(code) && Object.hasOwn(known, message)) return { error: known[message], uncertain: false }
  if (code === '23505' && message.includes('"restaurant_table_name"')) return { error: 'Nama/nomor meja sudah dipakai. Gunakan nama/nomor meja lain.', uncertain: false }
  if (code === 'PGRST202') return { error: 'Layanan restoran belum tersedia. Hubungi pengelola aplikasi.', uncertain: false }
  const fallback: Record<Operation, string> = {
    menu: 'Data menu belum bisa disimpan. Periksa nama, kategori, harga rupiah bulat, dan status menu.',
    table: 'Data meja belum bisa disimpan. Periksa nama/nomor, kapasitas 1 sampai 1.000 orang, dan status meja.',
    order: 'Pesanan belum bisa disimpan. Periksa jenis layanan, meja, jumlah tamu, dan menu yang dipilih.',
    payment: 'Pembayaran belum bisa dicatat. Periksa nominal, diskon, dan konfirmasi penerimaan dana.',
    cancel: 'Pesanan belum bisa dibatalkan. Periksa status pesanan dan isi alasan pembatalan 3 sampai 300 karakter.',
    refund: 'Transaksi belum bisa dibatalkan. Periksa alasan dan konfirmasi pembatalan serta pengembalian dana manual.',
  }
  if (['PT409', '23505', '23514', '22023', '22P02'].includes(code)) return { error: code === 'PT409' ? `${fallback[operation]} Muat ulang karena data telah berubah.` : fallback[operation], uncertain: false }
  return { error: 'Hasil penyimpanan belum pasti karena koneksi atau layanan terganggu. Ulangi permintaan yang sama atau muat ulang untuk memeriksa sebelum membuat permintaan baru.', uncertain: true }
}
