import type { Business } from '@/lib/validation'
import { paymentLabel, rupiah, saleCode, saleDate, type Sale } from '@/lib/pos'
import './sale-receipt.css'

function ReceiptRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="receipt-row"><dt>{label}</dt><dd>{children}</dd></div>
}

export default function SaleReceipt({ sale, business, id }: { sale: Sale; business: Business; id?: string }) {
  const address = business.street_address
    ? [business.street_address, business.village, business.district, business.city, business.province].filter(Boolean).join(', ')
    : business.address
  const date = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(sale.created_at)).replace(',', '').replace(/(\d{2})\.(\d{2})$/, '$1:$2') + ' WIB'
  const quantity = (value: number) => Number(value).toLocaleString('id-ID', { maximumFractionDigits: 3 })

  const orderDiscountLabel = sale.discount_kind === 'percent' && Number(sale.discount_value) > 0
    ? `Diskon keseluruhan (${Number(sale.discount_value)}%)`
    : 'Diskon keseluruhan'

  const fallbackDiscountLabel = sale.discount_kind === 'percent' && Number(sale.discount_value) > 0
    ? `Diskon (${Number(sale.discount_value)}%)`
    : 'Diskon'

  const isMember = Boolean(sale.customer_id || (sale.customer && sale.customer !== 'Pelanggan umum' && sale.customer !== 'Umum'))

  return (
    <section id={id} className="sale-receipt" aria-label="Struk pembayaran">
      <header className="receipt-header receipt-double-rule">
        <h2>{business.name}</h2>
        {address && <p>{address}</p>}
        {business.phone && <p>Telp: {business.phone}</p>}
      </header>
      {sale.status === 'cancelled' && <p className="receipt-cancelled">TRANSAKSI DIBATALKAN</p>}
      <dl className="receipt-metadata receipt-dashed-rule">
        <ReceiptRow label="No. Transaksi">{saleCode(sale)}</ReceiptRow>
        <ReceiptRow label="Tanggal">{date}</ReceiptRow>
        <ReceiptRow label="Kasir">{sale.actor_name}</ReceiptRow>
        <ReceiptRow label="Pelanggan">{sale.customer || 'Umum'}</ReceiptRow>
        {isMember && (
          <>
            {sale.customer_points !== undefined && sale.customer_points !== null && (
              <ReceiptRow label="Poin Member">{Number(sale.customer_points).toLocaleString('id-ID')} poin</ReceiptRow>
            )}
            {Number(sale.points_earned) > 0 && (
              <ReceiptRow label="Poin Diperoleh">+{Number(sale.points_earned).toLocaleString('id-ID')} poin</ReceiptRow>
            )}
          </>
        )}
      </dl>
      <table className="receipt-items" aria-label={business.category==='barbershop'?'Rincian layanan':'Rincian barang'}>
        <colgroup><col className="receipt-name-column" /><col className="receipt-quantity-column" /><col className="receipt-price-column" /><col className="receipt-price-column" /></colgroup>
        <thead className="receipt-double-rule"><tr><th scope="col">{business.category==='barbershop'?'Nama Layanan':'Nama Barang'}</th><th scope="col">Qty</th><th scope="col">Harga/U</th><th scope="col">Total</th></tr></thead>
        <tbody className="receipt-dashed-rule">
          {sale.lines.map(line => (
            <tr key={line.id}>
              <td><span>{line.name}</span></td>
              <td>{quantity(line.quantity)} {line.unit}</td>
              <td>
                {line.unit_price !== undefined && Number(line.unit_price) < Number(line.price) && <del className="receipt-item-discount">{rupiah(Number(line.price))}</del>}
                <span>{Number(line.unit_price ?? line.price).toLocaleString('id-ID')}</span>
              </td>
              <td>{Number(line.total).toLocaleString('id-ID')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="receipt-totals receipt-double-rule">
        <ReceiptRow label="Total Item">{sale.lines.length}</ReceiptRow>
        <ReceiptRow label="Subtotal">{rupiah(Number(sale.subtotal))}</ReceiptRow>
        {business.category==='restaurant' && Number(sale.point_discount)>0 ? <>
          <ReceiptRow label={fallbackDiscountLabel}>{rupiah(Number(sale.discount)-Number(sale.point_discount))}</ReceiptRow>
          <ReceiptRow label={`Tukar ${Number(sale.points_redeemed)} poin`}>{rupiah(Number(sale.point_discount))}</ReceiptRow>
        </> : business.category!=='barbershop' && sale.product_discount != null && sale.order_discount != null ? <>
          <ReceiptRow label="Diskon produk">{rupiah(Number(sale.product_discount))}</ReceiptRow>
          <ReceiptRow label={orderDiscountLabel}>{rupiah(Number(sale.order_discount))}</ReceiptRow>
          {Number(sale.point_discount)>0 && <ReceiptRow label={`Tukar ${Number(sale.points_redeemed)} poin`}>{rupiah(Number(sale.point_discount))}</ReceiptRow>}
        </> : <ReceiptRow label={fallbackDiscountLabel}>{rupiah(Number(sale.discount))}</ReceiptRow>}
        {Number(sale.service_amount)>0 && <ReceiptRow label={`Biaya layanan (${Number(sale.service_rate)}%)`}>{rupiah(Number(sale.service_amount))}</ReceiptRow>}
        {sale.tax_rate !== undefined && <ReceiptRow label={`Pajak (${Number(sale.tax_rate)}%)`}>{rupiah(Number(sale.tax_amount || 0))}</ReceiptRow>}
      </dl>
      <dl className="receipt-payment receipt-double-rule">
        <ReceiptRow label="TOTAL BAYAR">{rupiah(Number(sale.total))}</ReceiptRow>
        {Number(sale.deposit_amount)>0 && <><ReceiptRow label={`DP (${sale.deposit_payment ? paymentLabel[sale.deposit_payment] : 'Terkonfirmasi'})`}>{rupiah(Number(sale.deposit_amount))}</ReceiptRow><ReceiptRow label="SISA TAGIHAN">{rupiah(Number(sale.total)-Number(sale.deposit_amount))}</ReceiptRow></>}
        <ReceiptRow label={paymentLabel[sale.payment].toUpperCase()}>{rupiah(Number(sale.balance_received ?? sale.received))}</ReceiptRow>
        <ReceiptRow label="KEMBALIAN">{rupiah(Number(sale.change))}</ReceiptRow>
      </dl>
      {sale.status === 'cancelled' && <div className="receipt-refund receipt-dashed-rule">
        <p>Dibatalkan oleh {sale.cancelled_by_name}</p>
        <p>{saleDate(sale.cancelled_at!)}</p>
        <p>Alasan: {sale.cancellation_reason}</p>
        <p>{business.category === 'barbershop' ? 'Pembatalan transaksi dicatat; riwayat pelayanan tetap tersimpan.' : business.category === 'restaurant' ? 'Pembatalan pesanan dicatat.' : 'Stok dikembalikan.'}</p>
        <p>Pengembalian dana manual dikonfirmasi: {rupiah(Number(sale.refund_amount))}.</p>
      </div>}
      <footer className="receipt-footer receipt-double-rule">
        <p>TERIMA KASIH ATAS KUNJUNGANNYA</p>
        <p>Simpan struk ini sebagai bukti pembayaran.</p>
        {sale.payment !== 'cash' && <p>Pembayaran {paymentLabel[sale.payment]} dikonfirmasi petugas secara manual.</p>}
      </footer>
    </section>
  )
}
