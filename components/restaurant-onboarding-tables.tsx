'use client'

import { useState, useId, useRef, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Users, AlertTriangle, X } from 'lucide-react'
import type { RestaurantTable, RestaurantTableUsage } from '@/lib/restaurant'
import { saveRestaurantResource } from '@/app/restaurant-actions'
import {
  RestaurantDialog,
  RestaurantField,
  restaurantPanel,
  restaurantInput,
  restaurantButton,
  restaurantPrimary,
} from './restaurant-forms'

interface CapacityTier {
  capacity: number
  count: number
  isCustom?: boolean
}

interface GeneratedTable {
  id: string
  name: string
  capacity: number
}

export function RestaurantOnboardingTables({
  tables = [],
  usage = [],
}: {
  tables?: RestaurantTable[]
  usage?: RestaurantTableUsage[]
}) {
  const router = useRouter()
  const [localTables, setLocalTables] = useState<RestaurantTable[]>(tables)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [errorNotice, setErrorNotice] = useState('')

  // Modals state
  const [isBulkOpen, setIsBulkOpen] = useState(false)
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null)
  const [deletingTable, setDeletingTable] = useState<RestaurantTable | null>(null)
  const [viewingTable, setViewingTable] = useState<RestaurantTable | null>(null)

  // Bulk creation state
  const [groupName, setGroupName] = useState('Indoor')
  const [tiers, setTiers] = useState<CapacityTier[]>([
    { capacity: 2, count: 0 },
    { capacity: 4, count: 0 },
    { capacity: 6, count: 0 },
    { capacity: 8, count: 0 },
  ])
  const [bulkPending, setBulkPending] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const [customCapacityInput, setCustomCapacityInput] = useState('')
  const [showAddCustomTier, setShowAddCustomTier] = useState(false)

  // Single edit state
  const [editName, setEditName] = useState('')
  const [editCapacity, setEditCapacity] = useState('2')
  const [editPending, setEditPending] = useState(false)
  const [editError, setEditError] = useState('')

  // Single delete state
  const [deletePending, setDeletePending] = useState(false)

  // Keep local tables in sync when prop changes
  const activeTables = localTables.filter((t) => t.active)
  const filteredTables = activeTables
    .filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'id-ID', { numeric: true, sensitivity: 'base' }))

  // Compute preview for bulk tables
  const generatedPreview: GeneratedTable[] = []
  const cleanGroup = groupName.trim()
  if (cleanGroup) {
    tiers.forEach((tier) => {
      if (tier.count > 0 && tier.capacity > 0) {
        for (let i = 1; i <= tier.count; i++) {
          const numStr = i < 10 ? `0${i}` : `${i}`
          const name = `${cleanGroup} ${tier.capacity}P - ${numStr}`
          generatedPreview.push({
            id: crypto.randomUUID(),
            name,
            capacity: tier.capacity,
          })
        }
      }
    })
  }

  // Check collision with existing tables
  const existingNamesLower = new Set(localTables.map((t) => t.name.toLowerCase()))
  const collidingNames = generatedPreview.filter((g) => existingNamesLower.has(g.name.toLowerCase()))

  const handleOpenBulk = () => {
    setGroupName('Indoor')
    setTiers([
      { capacity: 2, count: 4 },
      { capacity: 4, count: 6 },
      { capacity: 6, count: 2 },
      { capacity: 8, count: 0 },
    ])
    setBulkError('')
    setIsBulkOpen(true)
  }

  const handleTierCountChange = (index: number, val: number) => {
    const next = [...tiers]
    next[index].count = Math.max(0, val)
    setTiers(next)
  }

  const handleAddCustomTier = () => {
    const cap = parseInt(customCapacityInput, 10)
    if (!cap || cap <= 0 || cap > 1000) return
    if (tiers.some((t) => t.capacity === cap)) {
      setBulkError(`Kapasitas ${cap} orang sudah ada dalam daftar.`)
      return
    }
    setTiers([...tiers, { capacity: cap, count: 2, isCustom: true }].sort((a, b) => a.capacity - b.capacity))
    setCustomCapacityInput('')
    setShowAddCustomTier(false)
    setBulkError('')
  }

  const handleRemoveCustomTier = (index: number) => {
    setTiers(tiers.filter((_, idx) => idx !== index))
  }

  const handleBulkSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!cleanGroup) {
      setBulkError('Isi nama kelompok meja (misal: Indoor, Outdoor, VIP).')
      return
    }
    if (generatedPreview.length === 0) {
      setBulkError('Tentukan jumlah meja pada minimal satu kapasitas tempat duduk.')
      return
    }
    if (collidingNames.length > 0) {
      setBulkError(`Nama meja "${collidingNames[0].name}" sudah ada. Gunakan nama kelompok lain atau ubah nomor.`)
      return
    }

    setBulkPending(true)
    setBulkError('')
    let createdCount = 0

    try {
      const newlyCreated: RestaurantTable[] = []
      for (const item of generatedPreview) {
        const result = await saveRestaurantResource(
          'table',
          { id: item.id, revision: null, request: crypto.randomUUID() },
          { name: item.name, capacity: item.capacity, active: true }
        )
        if (result.value && 'name' in result.value) {
          newlyCreated.push(result.value as RestaurantTable)
          createdCount++
        } else if (result.error) {
          throw new Error(result.error)
        }
      }

      setLocalTables((prev) => [...prev, ...newlyCreated])
      setIsBulkOpen(false)
      setNotice(`Berhasil membuat ${createdCount} meja kelompok "${cleanGroup}".`)
      setErrorNotice('')
      router.refresh()
    } catch (err: any) {
      setBulkError(err.message || 'Gagal membuat sebagian meja. Silakan muat ulang halaman.')
    } finally {
      setBulkPending(false)
    }
  }

  const handleOpenEdit = (table: RestaurantTable) => {
    setEditingTable(table)
    setEditName(table.name)
    setEditCapacity(String(table.capacity))
    setEditError('')
  }

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingTable) return
    const clean = editName.trim()
    const cap = parseInt(editCapacity, 10)
    if (!clean) {
      setEditError('Nama meja tidak boleh kosong.')
      return
    }
    if (!cap || cap <= 0 || cap > 1000) {
      setEditError('Kapasitas harus antara 1 sampai 1.000 orang.')
      return
    }

    setEditPending(true)
    setEditError('')
    try {
      const result = await saveRestaurantResource(
        'table',
        { id: editingTable.id, revision: editingTable.revision, request: crypto.randomUUID() },
        { name: clean, capacity: cap, active: true }
      )
      if (result.value && 'name' in result.value) {
        const updated = result.value as RestaurantTable
        setLocalTables((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
        setEditingTable(null)
        setNotice(`Meja "${updated.name}" berhasil diperbarui.`)
        setErrorNotice('')
        router.refresh()
      } else {
        setEditError(result.error || 'Gagal menyimpan perubahan meja.')
      }
    } catch (err: any) {
      setEditError(err.message || 'Gagal menyimpan perubahan meja.')
    } finally {
      setEditPending(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deletingTable) return

    // Check if table is occupied or reserved
    const isTaken = usage.some((u) => u.id === deletingTable.id && (u.occupied || u.reserved))
    if (isTaken) {
      setErrorNotice(`Meja "${deletingTable.name}" sedang digunakan atau memiliki reservasi aktif, tidak dapat dihapus.`)
      setDeletingTable(null)
      return
    }

    setDeletePending(true)
    try {
      const result = await saveRestaurantResource(
        'table',
        { id: deletingTable.id, revision: deletingTable.revision, request: crypto.randomUUID() },
        { name: deletingTable.name, capacity: deletingTable.capacity, active: false }
      )
      if (result.value) {
        setLocalTables((prev) => prev.filter((t) => t.id !== deletingTable.id))
        setNotice(`Meja "${deletingTable.name}" berhasil dihapus.`)
        setErrorNotice('')
        setDeletingTable(null)
        router.refresh()
      } else {
        setErrorNotice(result.error || 'Gagal menghapus meja.')
        setDeletingTable(null)
      }
    } catch (err: any) {
      setErrorNotice(err.message || 'Gagal menghapus meja.')
      setDeletingTable(null)
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <section className={restaurantPanel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-white">Daftar meja</h2>
          <p className="mt-1 text-sm text-[#c5cbd5]">
            Atur kelompok meja dan kapasitas tempat duduk untuk operasional restoran.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenBulk}
          className={restaurantPrimary}
        >
          <Plus className="size-4 mr-1.5 inline-block" /> Tambah meja
        </button>
      </div>

      {notice && (
        <div role="status" className="mt-4 rounded-xl border border-[#24cbc5]/30 bg-[#24cbc5]/10 p-3 text-sm text-[#24cbc5]">
          {notice}
        </div>
      )}
      {errorNotice && (
        <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {errorNotice}
        </div>
      )}

      {/* Filter / Search input */}
      {activeTables.length > 0 && (
        <div className="mt-4">
          <RestaurantField label="Cari meja">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari berdasarkan nama meja..."
              className={restaurantInput}
            />
          </RestaurantField>
        </div>
      )}

      {/* Grid of tables */}
      <div className="mt-5">
        {filteredTables.length > 0 ? (
          <div
            role="group"
            aria-label="Pilihan meja"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
          >
            {filteredTables.map((item) => {
              const isTaken = usage.some(
                (table) => table.id === item.id && (table.occupied || table.reserved)
              )
              return (
                <div
                  key={item.id}
                  onClick={() => setViewingTable(item)}
                  className={`group relative flex flex-col justify-between rounded-2xl border-0 bg-[#1c222e] p-3.5 text-left text-white shadow-sm transition-all cursor-pointer hover:bg-[#303640] ${
                    isTaken ? 'opacity-65' : ''
                  }`}
                >
                  {/* Card Header: Table name & Action icons */}
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-sm leading-tight text-white group-hover:text-[#24cbc5] transition-colors break-words">
                      {item.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0 -mr-1 -mt-1">
                      <button
                        type="button"
                        title={`Ubah ${item.name}`}
                        aria-label={`Ubah ${item.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenEdit(item)
                        }}
                        className="rounded-lg p-1.5 text-[#a4a7ac] hover:bg-[#273242] hover:text-[#24cbc5] transition-colors"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title={`Hapus ${item.name}`}
                        aria-label={`Hapus ${item.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeletingTable(item)
                        }}
                        className="rounded-lg p-1.5 text-[#a4a7ac] hover:bg-red-500/20 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Card Footer: Capacity & Indicator */}
                  <div className="mt-4 flex items-center justify-between text-xs text-[#c5cbd5]">
                    <span className="inline-flex items-center gap-1 font-medium bg-[#273242] px-2 py-0.5 rounded-full">
                      <Users className="size-3 text-[#24cbc5]" />
                      {item.capacity} orang
                    </span>
                    {isTaken && (
                      <span className="text-[10px] text-amber-400 font-medium">Terpakai</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[#454d5b]/60 p-8 text-center text-sm text-[#c5cbd5]">
            {activeTables.length === 0 ? (
              <div>
                <p className="font-medium text-white">Belum ada meja yang dibuat.</p>
                <p className="mt-1 text-xs text-[#a4a7ac]">
                  Gunakan tombol &quot;Tambah meja&quot; di atas untuk membuat meja restoran secara massal.
                </p>
              </div>
            ) : (
              <p>Tidak ada meja yang cocok dengan kata kunci &quot;{query}&quot;.</p>
            )}
          </div>
        )}

        {activeTables.length > 0 && (
          <p className="mt-3 text-xs text-[#a4a7ac]">
            Total {activeTables.length} meja aktif. Klik kartu meja untuk melihat detail, atau gunakan ikon Edit / Hapus pada kartu.
          </p>
        )}
      </div>

      {/* Modal 1: Pembuatan Meja Secara Massal */}
      {isBulkOpen && (
        <RestaurantDialog
          title="Tambah meja secara massal"
          busy={bulkPending}
          close={() => !bulkPending && setIsBulkOpen(false)}
          wide
        >
          <form onSubmit={handleBulkSubmit}>
            <fieldset disabled={bulkPending} className="space-y-4">
              <RestaurantField label="Nama kelompok / area meja *">
                <input
                  required
                  maxLength={40}
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Contoh: Indoor, Outdoor, VIP, Lantai 2"
                  className={restaurantInput}
                />
              </RestaurantField>
              <p className="text-xs text-[#a4a7ac]">
                Nama kelompok digunakan sebagai awalan identitas meja (misal: {cleanGroup || 'Indoor'} 2P - 01).
              </p>

              <div className="rounded-xl border border-[#454d5b]/40 bg-[#1c222e] p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#24cbc5]">
                    Jumlah Meja Berdasarkan Kapasitas
                  </span>
                  {!showAddCustomTier && (
                    <button
                      type="button"
                      onClick={() => setShowAddCustomTier(true)}
                      className="text-xs text-[#24cbc5] hover:underline"
                    >
                      + Tambah kapasitas lain
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {tiers.map((tier, idx) => (
                    <div key={tier.capacity} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2 min-w-36">
                        <Users className="size-4 text-[#a4a7ac]" />
                        <span className="font-medium text-white">Kapasitas {tier.capacity} orang</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={tier.count || ''}
                          onChange={(e) => handleTierCountChange(idx, parseInt(e.target.value, 10) || 0)}
                          placeholder="0"
                          className="h-9 w-20 rounded-lg border border-[#454d5b] bg-[#273242] px-2.5 text-center text-sm font-semibold text-white outline-none focus:border-[#24cbc5]"
                        />
                        <span className="text-xs text-[#c5cbd5] w-8">meja</span>
                        {tier.isCustom && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomTier(idx)}
                            className="rounded p-1 text-[#a4a7ac] hover:text-red-400"
                            title="Hapus kapasitas ini"
                          >
                            <X className="size-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Form to add custom tier */}
                {showAddCustomTier && (
                  <div className="mt-3 flex items-center gap-2 border-t border-[#454d5b]/40 pt-3">
                    <span className="text-xs text-[#c5cbd5]">Kapasitas:</span>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={customCapacityInput}
                      onChange={(e) => setCustomCapacityInput(e.target.value)}
                      placeholder="Contoh: 10"
                      className="h-8 w-24 rounded-lg border border-[#454d5b] bg-[#273242] px-2 text-xs text-white"
                    />
                    <span className="text-xs text-[#c5cbd5]">orang</span>
                    <button
                      type="button"
                      onClick={handleAddCustomTier}
                      className="h-8 rounded-lg bg-[#24cbc5] px-3 text-xs font-semibold text-black hover:bg-[#1fb3ad]"
                    >
                      Tambahkan
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddCustomTier(false)}
                      className="h-8 rounded-lg bg-[#303640] px-2.5 text-xs text-white hover:bg-[#3d4653]"
                    >
                      Batal
                    </button>
                  </div>
                )}
              </div>

              {/* Summary Box */}
              <div className="rounded-xl bg-[#273242]/70 p-3.5 text-xs text-[#c5cbd5]">
                <div className="flex items-center justify-between font-semibold text-white">
                  <span>Ringkasan pembuatan:</span>
                  <span className="text-[#24cbc5]">
                    {generatedPreview.length > 0
                      ? `Total ${generatedPreview.length} meja akan dibuat`
                      : 'Belum ada meja ditentukan'}
                  </span>
                </div>
                {generatedPreview.length > 0 && (
                  <div className="mt-2.5 max-h-24 overflow-y-auto space-y-1 pr-1 text-[11px] text-[#a4a7ac]">
                    <p className="text-[#c5cbd5]">Contoh penamaan otomatis:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {generatedPreview.slice(0, 10).map((p) => (
                        <span key={p.name} className="rounded bg-[#1c222e] px-1.5 py-0.5 font-mono text-white">
                          {p.name}
                        </span>
                      ))}
                      {generatedPreview.length > 10 && (
                        <span className="text-[#a4a7ac] self-center">
                          +{generatedPreview.length - 10} lainnya
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </fieldset>

            {bulkError && <p role="alert" className="mt-3 text-sm text-[#ffb4ae]">{bulkError}</p>}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                disabled={bulkPending}
                onClick={() => setIsBulkOpen(false)}
                className={restaurantButton}
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={bulkPending || generatedPreview.length === 0}
                className={restaurantPrimary}
              >
                {bulkPending ? 'Membuat meja...' : `Simpan ${generatedPreview.length} meja`}
              </button>
            </div>
          </form>
        </RestaurantDialog>
      )}

      {/* Modal 2: Edit Single Table */}
      {editingTable && (
        <RestaurantDialog
          title={`Ubah meja ${editingTable.name}`}
          busy={editPending}
          close={() => !editPending && setEditingTable(null)}
        >
          <form onSubmit={handleSaveEdit}>
            <fieldset disabled={editPending} className="space-y-4">
              <RestaurantField label="Nama meja *">
                <input
                  required
                  maxLength={60}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={restaurantInput}
                />
              </RestaurantField>
              <RestaurantField label="Kapasitas tempat duduk (orang) *">
                <input
                  required
                  type="number"
                  min={1}
                  max={1000}
                  value={editCapacity}
                  onChange={(e) => setEditCapacity(e.target.value)}
                  className={restaurantInput}
                />
              </RestaurantField>
            </fieldset>

            {editError && <p role="alert" className="mt-3 text-sm text-[#ffb4ae]">{editError}</p>}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                disabled={editPending}
                onClick={() => setEditingTable(null)}
                className={restaurantButton}
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={editPending}
                className={restaurantPrimary}
              >
                {editPending ? 'Menyimpan...' : 'Simpan perubahan'}
              </button>
            </div>
          </form>
        </RestaurantDialog>
      )}

      {/* Modal 3: Detail Meja (WITHOUT 'Ubah Meja' button per requirement 4.C) */}
      {viewingTable && (
        <RestaurantDialog
          title={`Detail ${viewingTable.name}`}
          busy={false}
          close={() => setViewingTable(null)}
        >
          <div className="space-y-3 text-sm text-[#c5cbd5]">
            <div className="flex justify-between border-b border-[#454d5b]/40 pb-2">
              <span className="text-[#a4a7ac]">Nama meja</span>
              <strong className="text-white">{viewingTable.name}</strong>
            </div>
            <div className="flex justify-between border-b border-[#454d5b]/40 pb-2">
              <span className="text-[#a4a7ac]">Kapasitas</span>
              <span className="font-semibold text-[#24cbc5]">{viewingTable.capacity} orang</span>
            </div>
            <div className="flex justify-between border-b border-[#454d5b]/40 pb-2">
              <span className="text-[#a4a7ac]">Status operasional</span>
              <span className="text-emerald-400 font-medium">Aktif</span>
            </div>
            <div className="flex justify-between pb-1">
              <span className="text-[#a4a7ac]">Status sesi</span>
              <span>
                {usage.some((u) => u.id === viewingTable.id && u.occupied)
                  ? 'Sedang terpakai (pesanan terbuka)'
                  : usage.some((u) => u.id === viewingTable.id && u.reserved)
                  ? 'Terkunci untuk reservasi'
                  : 'Tersedia untuk tamu baru'}
              </span>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => setViewingTable(null)}
              className={restaurantButton}
            >
              Tutup
            </button>
          </div>
        </RestaurantDialog>
      )}

      {/* Modal 4: Konfirmasi Hapus Meja */}
      {deletingTable && (
        <RestaurantDialog
          title={`Hapus ${deletingTable.name}?`}
          busy={deletePending}
          close={() => !deletePending && setDeletingTable(null)}
        >
          <div className="space-y-3 text-sm text-[#c5cbd5]">
            <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-300">
              <AlertTriangle className="size-5 shrink-0 text-red-400 mt-0.5" />
              <div>
                <p className="font-medium text-white">Konfirmasi penghapusan meja</p>
                <p className="mt-1 text-xs text-red-300">
                  Meja ini akan dinonaktifkan dari sistem pemesanan. Riwayat transaksi dan reservasi sebelumnya tetap tersimpan dengan aman.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              disabled={deletePending}
              onClick={() => setDeletingTable(null)}
              className={restaurantButton}
            >
              Batal
            </button>
            <button
              type="button"
              disabled={deletePending}
              onClick={handleConfirmDelete}
              className="min-h-11 inline-flex items-center justify-center rounded-xl border-0 bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {deletePending ? 'Menghapus...' : 'Ya, Hapus Meja'}
            </button>
          </div>
        </RestaurantDialog>
      )}
    </section>
  )
}
