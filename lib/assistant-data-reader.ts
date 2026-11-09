import type { SupabaseClient } from '@supabase/supabase-js'
import { assistantFilter, type AssistantContext, type AssistantRequest, type Fact } from './assistant'
import { dataFacts, sourceAllowed, sourceLabels, type DataRead } from './assistant-data'
import { GeminiError } from './assistant-gemini'

const definitions = {
  business: ['businesses', 'name,category,address,city,province,district,village,description,operating_hours,tax_rate,loyalty_active,loyalty_point_nominal', 'name'],
  staff: ['business_members', 'name,role,active', 'name'],
  catalog: ['catalog_products', 'name,category,unit,sku,price,discount_kind,discount_value,active', 'name'],
  inventory: ['catalog_products', 'name,unit,stock,minimum_stock,active', 'name'],
  stock_history: ['stock_movements', 'product_name,kind,quantity,before_stock,after_stock,unit,created_at', 'product_name'],
  customers: ['customers', 'name,active,points', 'name'],
  payments: ['business_payments', 'cash,qris,transfer,ewallet', 'business_id'],
  billing: ['restaurant_billing_settings', 'tax_rate,service_rate,tax_base,service_scope,loyalty_active,earn_nominal,redemption_active,point_value', 'business_id'],
  sales: ['pos_transactions', 'receipt_number,customer,actor_name,lines,status,subtotal,discount,tax_amount,total,payment,created_at,refund_amount,cancelled_at', 'customer'],
  tables: ['restaurant_tables', 'name,capacity,active,occupied_until_released', 'name'],
  orders: ['restaurant_orders', 'customer,table_name,kind,guests,stage,status,subtotal,lines,occupies_table,created_at', 'customer'],
  reservations: ['restaurant_reservations', 'customer,table_name,guests,starts_at,ends_at,status,deposit_amount,deposit_refunded', 'customer'],
} as const

export async function readAssistantData(client: SupabaseClient, businessId: string, role: string, category: 'store' | 'restaurant', period: AssistantRequest['period'], reads: DataRead[]): Promise<{ context: AssistantContext; dataWarning?: string }> {
  const now = new Date().toISOString(), filter = assistantFilter(period)
  const { data: permissions, error } = await client.rpc('business_permissions', { target_id: businessId }).abortSignal(AbortSignal.timeout(10000))
  if (error || !Array.isArray(permissions)) throw new GeminiError(403, 'Izin Asisten belum dapat diverifikasi.')
  if (!sourceAllowed('business', category, role, permissions)) throw new GeminiError(403, 'Akses Asisten ditolak.')
  let warning = false
  const selected: DataRead[] = [{ source: 'business', search: '', page: 1 }, ...(category === 'restaurant' ? [{ source: 'billing' as const, search: '', page: 1 }] : []), ...reads.filter(read => read.source !== 'business' && !(category === 'restaurant' && read.source === 'billing'))]
  const batches = await Promise.all(selected.map(async (read): Promise<Fact[]> => {
    const label = sourceLabels[read.source]
    if (!sourceAllowed(read.source, category, role, permissions)) {
      return [{ id: `${read.source}_denied`, text: `Akses ${label} tidak diizinkan untuk akun ini.`, providerText: `Akses ${label} tidak diizinkan untuk akun ini.`, source: label }]
    }
    try {
      if (read.source === 'report') {
        const { readAssistantContext } = await import('./assistant-server')
        return (await readAssistantContext(client, businessId, period, category)).facts
      }
      let [table, columns, searchColumn]: readonly string[] = definitions[read.source]
      if (read.source === 'catalog' && category === 'restaurant') { table = 'restaurant_menu'; columns = 'name,category,price,available,active' }
      let query = client.from(table).select(columns, { count: 'exact' }).eq(read.source === 'business' ? 'id' : 'business_id', businessId)
      if (read.source === 'tables') query = query.is('deleted_at', null)
      if (read.search) query = query.ilike(searchColumn, `%${read.search.replace(/[\\%_]/g, '\\$&')}%`)
      const dateColumn = read.source === 'reservations' ? 'starts_at' : ['stock_history', 'sales', 'orders'].includes(read.source) ? 'created_at' : null
      if (dateColumn) {
        const end = new Date(filter.to + 'T00:00:00+07:00'); end.setUTCDate(end.getUTCDate() + 1)
        query = query.gte(dateColumn, filter.from + 'T00:00:00+07:00').lt(dateColumn, end.toISOString())
      }
      if (read.source === 'catalog' && read.order && read.order !== 'default') query = query.order('price', { ascending: read.order === 'price_asc' })
      query = query.order(dateColumn || searchColumn, { ascending: !dateColumn })
      if (!['business', 'payments', 'billing'].includes(read.source)) query = query.order('id')
      const start = (read.page - 1) * 20
      const { data, count, error } = await query.range(start, start + 19).abortSignal(AbortSignal.timeout(10000))
      if (error || !data || count === null) throw Error('Read failed')
      return dataFacts(read, data as unknown as Record<string, unknown>[], count, now)
    } catch {
      warning = true
      const message = `${label} belum berhasil dibaca. Jangan menyimpulkan datanya kosong atau tidak ada.`
      return [{ id: `${read.source}_unavailable`, text: message, providerText: message, source: label }]
    }
  }))
  return { context: { filter, generatedAt: now, stockAt: now, facts: batches.flat(), advice: {} }, dataWarning: warning ? 'Sebagian sumber gagal dibaca. Jawaban hanya boleh memakai data yang berhasil diverifikasi.' : undefined }
}
