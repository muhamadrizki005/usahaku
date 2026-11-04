'use client'
import { useState } from 'react'
import type { RestaurantMenu } from '@/lib/restaurant'
import { rupiah } from '@/lib/pos'
import { RestaurantField, restaurantButton, restaurantInput } from './restaurant-forms'

export type ReservationMealLine = { id: string; quantity: string }
export default function ReservationMealFields({ menu, lines, onChange, notes, onNotes }: { menu: RestaurantMenu[]; lines: ReservationMealLine[]; onChange: (lines: ReservationMealLine[]) => void; notes: string; onNotes: (notes: string) => void }) {
  const [choice, setChoice] = useState('')
  const subtotal = lines.reduce((sum, line) => sum + Number(menu.find(m => m.id === line.id)?.price || 0) * Number(line.quantity), 0)
  function add() {
    if (!choice || lines.length >= 100) return
    const existing = lines.find(l => l.id === choice)
    onChange(existing ? lines.map(l => l.id === choice ? { ...l, quantity: String(Math.min(9999, Number(l.quantity || 0) + 1)) } : l) : [...lines, { id: choice, quantity: '1' }])
    setChoice('')
  }
  return <div className="space-y-4">
    <RestaurantField label="Pilih menu reservasi"><select value={choice} onChange={e => setChoice(e.target.value)} className={restaurantInput}><option value="">Pilih menu tersedia</option>{menu.filter(m => m.active && m.available).map(m => <option key={m.id} value={m.id}>{m.name} / {rupiah(Number(m.price))}</option>)}</select></RestaurantField>
    <button type="button" disabled={!choice || lines.length >= 100} onClick={add} className={restaurantButton}>Tambahkan menu</button>
    {!menu.some(m => m.active && m.available) && <p className="text-sm leading-6 text-[#c5cbd5]">Belum ada menu tersedia. Anda tetap bisa menyimpan reservasi meja tanpa makanan.</p>}
    {!lines.length && <p className="text-sm text-[#c5cbd5]">Tambahkan minimal satu menu atau nonaktifkan pesanan makanan untuk reservasi meja saja.</p>}
    <ul className="divide-y divide-[#454d5b]">{lines.map(line => {
      const item = menu.find(m => m.id === line.id)
      return <li key={line.id} className="py-3"><p className="break-words text-sm">{item?.name || 'Menu tidak tersedia'} / {rupiah(Number(item?.price || 0))} per porsi</p><div className="mt-2 flex flex-wrap items-end gap-3"><RestaurantField label={'Jumlah ' + (item?.name || 'menu')}><input required type="number" min={1} max={9999} step={1} inputMode="numeric" value={line.quantity} onChange={e => onChange(lines.map(l => l.id === line.id ? { ...l, quantity: e.target.value } : l))} className={restaurantInput}/></RestaurantField><button type="button" onClick={() => onChange(lines.filter(l => l.id !== line.id))} aria-label={'Hapus ' + (item?.name || 'menu')} className={restaurantButton}>Hapus</button></div></li>
    })}</ul>
    <RestaurantField label="Catatan makanan"><textarea maxLength={300} value={notes} onChange={e => onNotes(e.target.value)} className={restaurantInput}/></RestaurantField>
    <p className="text-sm">Subtotal makanan: {rupiah(subtotal)}</p>
    <p className="text-xs leading-5 text-[#c5cbd5]">Harga dan ketersediaan diperiksa lagi saat disimpan. Pesanan ini belum menandai pelanggan datang atau membuat meja terpakai.</p>
  </div>
}
