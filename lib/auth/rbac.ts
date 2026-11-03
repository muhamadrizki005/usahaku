export type ModuleId =
  | 'overview'
  | 'products'
  | 'inventory'
  | 'pos'
  | 'transactions'
  | 'customers'
  | 'reports'
  | 'staff'
  | 'settings'

export type PermissionItem = {
  key: string
  label: string
  description: string
}

export type ModuleDefinition = {
  id: ModuleId
  label: string
  description: string
  permissions: PermissionItem[]
}

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    id: 'overview',
    label: 'Ringkasan',
    description: 'Dashboard performa, metrik omzet, dan tren usaha.',
    permissions: [
      { key: 'overview:view', label: 'Lihat ringkasan', description: 'Melihat dashboard, grafik penjualan, dan metrik usaha.' },
    ],
  },
  {
    id: 'products',
    label: 'Produk',
    description: 'Manajemen katalog barang, harga, dan varian.',
    permissions: [
      { key: 'products:view', label: 'Lihat produk', description: 'Melihat daftar produk dan katalog yang tersedia.' },
      { key: 'products:create', label: 'Tambah produk', description: 'Menambahkan produk baru ke dalam katalog toko.' },
      { key: 'products:edit', label: 'Ubah produk', description: 'Mengubah nama, harga jual, foto, dan kategori produk.' },
      { key: 'products:delete', label: 'Hapus produk', description: 'Menghapus atau menonaktifkan produk dari katalog.' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventori',
    description: 'Pencatatan persediaan, stok minimum, dan mutasi barang.',
    permissions: [
      { key: 'inventory:view', label: 'Lihat inventori', description: 'Melihat jumlah stok fisik dan riwayat pergerakan stok.' },
      { key: 'inventory:create', label: 'Catat stok masuk/keluar', description: 'Mencatat penambahan stok barang masuk atau barang rusak/keluar.' },
      { key: 'inventory:edit', label: 'Penyesuaian stok', description: 'Mengatur batas minimum stok dan penyesuaian hitung fisik (opname).' },
    ],
  },
  {
    id: 'pos',
    label: 'Kasir (POS)',
    description: 'Operasional pemindaian barcode, kasir, dan pembayaran pelanggan.',
    permissions: [
      { key: 'pos:view', label: 'Buka kasir', description: 'Mengakses layar kasir (POS) untuk melayani transaksi.' },
      { key: 'pos:create', label: 'Buat transaksi', description: 'Memproses keranjang belanja dan menerima pembayaran kasir.' },
      { key: 'pos:cancel', label: 'Batalkan transaksi aktif', description: 'Mengosongkan atau membatalkan draf belanja di kasir.' },
      { key: 'pos:discount', label: 'Berikan diskon', description: 'Menerapkan diskon produk atau diskon nota di kasir.' },
    ],
  },
  {
    id: 'transactions',
    label: 'Transaksi',
    description: 'Riwayat struk, catatan transaksi kasir, dan penanganan retur.',
    permissions: [
      { key: 'transactions:view', label: 'Lihat transaksi', description: 'Melihat daftar riwayat struk dan rincian transaksi kasir.' },
      { key: 'transactions:cancel', label: 'Batalkan transaksi selesai', description: 'Membatalkan transaksi yang sudah dicatat dan mengembalikan stok.' },
      { key: 'transactions:refund', label: 'Kelola refund / retur', description: 'Mencatat pengembalian dana atau retur barang belanjaan.' },
    ],
  },
  {
    id: 'customers',
    label: 'Pelanggan',
    description: 'Data member, riwayat belanja pelanggan, dan loyalitas.',
    permissions: [
      { key: 'customers:view', label: 'Lihat pelanggan', description: 'Melihat daftar member dan pelanggan terdaftar.' },
      { key: 'customers:create', label: 'Tambah pelanggan', description: 'Mendaftarkan pelanggan baru dari POS atau menu pelanggan.' },
      { key: 'customers:edit', label: 'Ubah pelanggan', description: 'Mengubah kontak, nama, atau catatan pelanggan.' },
      { key: 'customers:delete', label: 'Hapus pelanggan', description: 'Menghapus profil pelanggan dari sistem usaha.' },
    ],
  },
  {
    id: 'reports',
    label: 'Laporan',
    description: 'Analisis penjualan berkala, metode pembayaran, dan ekspor data.',
    permissions: [
      { key: 'reports:view', label: 'Lihat laporan', description: 'Melihat laporan penjualan, omzet kasir, dan ranking produk.' },
      { key: 'reports:export', label: 'Ekspor laporan', description: 'Mendownload data penjualan dalam format CSV atau cetak PDF.' },
    ],
  },
  {
    id: 'staff',
    label: 'Staf & Akses',
    description: 'Pengelolaan akun tim, pembagian tugas, dan role izin.',
    permissions: [
      { key: 'staff:view', label: 'Lihat anggota', description: 'Melihat daftar staf operasional dan peran yang ditugaskan.' },
      { key: 'staff:manage', label: 'Kelola staf & role', description: 'Membuat akun staf baru, reset sandi, dan membuat/mengatur role custom.' },
    ],
  },
  {
    id: 'settings',
    label: 'Pengaturan Usaha',
    description: 'Identitas toko, jam buka operasional, dan metode pembayaran.',
    permissions: [
      { key: 'settings:view', label: 'Lihat pengaturan', description: 'Melihat konfigurasi toko dan identitas usaha.' },
      { key: 'settings:edit', label: 'Ubah pengaturan', description: 'Mengubah profil usaha, jam operasional, QRIS, rekening bank, dan e-wallet.' },
    ],
  },
]

export const ALL_PERMISSIONS = MODULE_DEFINITIONS.flatMap(m => m.permissions.map(p => p.key))

export const DEFAULT_ADMIN_PERMISSIONS: string[] = [
  'overview:view',
  'products:view',
  'products:create',
  'products:edit',
  'products:delete',
  'inventory:view',
  'inventory:create',
  'inventory:edit',
  'pos:view',
  'pos:create',
  'pos:cancel',
  'pos:discount',
  'transactions:view',
  'transactions:cancel',
  'transactions:refund',
  'customers:view',
  'customers:create',
  'customers:edit',
  'customers:delete',
  'reports:view',
  'reports:export',
]

export const DEFAULT_CASHIER_PERMISSIONS: string[] = [
  'pos:view',
  'pos:create',
  'transactions:view',
]

export interface BusinessRole {
  id: string
  business_id: string
  name: string
  description: string
  is_default: boolean
  role_key?: string
  permissions: string[]
  created_at: string
  updated_at: string
}

export function normalizeRoleKey(role: string): string {
  return role.trim().toLowerCase()
}

export function builtInRole(role: string): 'owner' | 'admin' | 'cashier' | null {
  const key = normalizeRoleKey(role)
  if (key === 'owner' || key === 'pemilik') return 'owner'
  if (key === 'admin' || key === 'admin toko') return 'admin'
  if (['cashier', 'kasir', 'petugas kasir'].includes(key)) return 'cashier'
  return null
}

export function roleValue(role: BusinessRole): string {
  return role.role_key || (role.is_default ? builtInRole(role.name) : null) || role.id
}

export function findBusinessRole(value: string, roles: BusinessRole[]): BusinessRole | undefined {
  const builtin = builtInRole(value)
  return builtin ? roles.find(role => roleValue(role) === builtin && role.is_default)
    : roles.find(role => roleValue(role) === value || role.id === value || normalizeRoleKey(role.name) === normalizeRoleKey(value))
}

export function rolePermissionLimit(value: string): string[] {
  return builtInRole(value) === 'cashier' ? DEFAULT_CASHIER_PERMISSIONS : DEFAULT_ADMIN_PERMISSIONS
}

export function permissionDependencies(permission: string): string[] {
  const module = permission.split(':')[0]
  const dependencies = permission.endsWith(':view') ? [] : [module + ':view']
  if (permission === 'customers:delete') dependencies.push('customers:edit')
  if (permission === 'transactions:cancel') dependencies.push('transactions:refund')
  if (permission === 'transactions:refund') dependencies.push('transactions:cancel')
  return dependencies
}

export function toggleRolePermission(current: Set<string>, permission: string): Set<string> {
  const next = new Set(current)
  if (next.has(permission)) {
    next.delete(permission)
    let changed = true
    while (changed) {
      changed = false
      for (const key of next) if (permissionDependencies(key).some(required => !next.has(required))) { next.delete(key); changed = true }
    }
  } else {
    next.add(permission)
    for (const required of permissionDependencies(permission)) next.add(required)
  }
  return next
}

/**
 * Resolves permissions for a member based on role string and available business roles.
 * Owner always gets full permissions ('*').
 */
export function resolveMemberPermissions(
  role: string,
  roles: BusinessRole[] = []
): string[] {
  if (normalizeRoleKey(role) === 'owner') return ALL_PERMISSIONS
  const matched = findBusinessRole(role, roles)
  if (!matched || !Array.isArray(matched.permissions)) return []
  const limit = rolePermissionLimit(roleValue(matched))
  return [...new Set(matched.permissions.filter(permission => limit.includes(permission)))]
}

/**
 * Checks if a member possesses a required permission.
 * Owner always returns true.
 */
export function hasPermission(
  memberRole: string,
  memberPermissions: string[] | undefined,
  required: string
): boolean {
  if (normalizeRoleKey(memberRole) === 'owner') return true
  if (!rolePermissionLimit(memberRole).includes(required)) return false
  if (!memberPermissions || !Array.isArray(memberPermissions)) return false
  return memberPermissions.includes(required)
}

/**
 * Determines whether a route path can be accessed given a member's role and permissions.
 */
export function permissionForPath(path: string): string | null {
  const clean = path.split('?')[0]
  if (clean === '/dashboard') return 'overview:view'
  if (clean === '/dashboard/settings' || clean.startsWith('/dashboard/settings/')) return clean.startsWith('/dashboard/settings/staff') ? 'staff:view' : 'settings:view'
  if (clean === '/dashboard/assistant') return 'reports:view'
  const module = ['products','inventory','pos','transactions','customers','reports'].find(value => clean === '/dashboard/' + value || clean.startsWith('/dashboard/' + value + '/'))
  return module ? module + ':view' : null
}

export function canAccessPath(
  path: string,
  memberRole: string,
  memberPermissions: string[] = []
): boolean {
  if (normalizeRoleKey(memberRole) === 'owner') return true

  const cleanPath = path.split('?')[0]

  if (cleanPath === '/dashboard') {
    return hasPermission(memberRole, memberPermissions, 'overview:view')
  }
  if (cleanPath === '/dashboard/products' || cleanPath.startsWith('/dashboard/products/')) {
    return hasPermission(memberRole, memberPermissions, 'products:view')
  }
  if (cleanPath === '/dashboard/inventory' || cleanPath.startsWith('/dashboard/inventory/')) {
    return hasPermission(memberRole, memberPermissions, 'inventory:view')
  }
  if (cleanPath === '/dashboard/pos' || cleanPath.startsWith('/dashboard/pos/')) {
    return hasPermission(memberRole, memberPermissions, 'pos:view')
  }
  if (cleanPath === '/dashboard/transactions' || cleanPath.startsWith('/dashboard/transactions/')) {
    return hasPermission(memberRole, memberPermissions, 'transactions:view')
  }
  if (cleanPath === '/dashboard/customers' || cleanPath.startsWith('/dashboard/customers/')) {
    return hasPermission(memberRole, memberPermissions, 'customers:view')
  }
  if (cleanPath === '/dashboard/reports' || cleanPath.startsWith('/dashboard/reports/')) {
    return hasPermission(memberRole, memberPermissions, 'reports:view')
  }
  if (cleanPath === '/dashboard/settings/staff' || cleanPath.startsWith('/dashboard/settings/staff/')) {
    return false
  }
  if (cleanPath === '/dashboard/settings' || cleanPath.startsWith('/dashboard/settings/')) {
    return false
  }
  if (cleanPath === '/dashboard/assistant') {
    return hasPermission(memberRole, memberPermissions, 'reports:view') && hasPermission(memberRole, memberPermissions, 'products:view')
  }

  return false
}

export function getRoleDisplayName(role: string, roles: BusinessRole[] = []): string {
  const norm = normalizeRoleKey(role)
  if (norm === 'owner') return 'Pemilik usaha'
  if (norm === 'admin') return 'Admin Toko'
  if (norm === 'cashier') return 'Petugas Kasir'

  const found = findBusinessRole(role, roles)
  if (found) return found.name

  return role
}
