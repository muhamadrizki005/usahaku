import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildAssistantContext, assistantFilter, type AssistantRequest, type StockSnapshot } from './assistant'
import { readReport } from './reports-server'
import { AssistantLimit } from './assistant-limit'

const state = globalThis as typeof globalThis & { usahakuAssistantLimit?: AssistantLimit }
export const assistantLimit = state.usahakuAssistantLimit ||= new AssistantLimit()
export const geminiConfig = () => ({ key: process.env.GEMINI_API_KEY?.trim() || '', model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite' })

export async function readAssistantContext(client: SupabaseClient, businessId: string, period: AssistantRequest['period']) {
  const filter = assistantFilter(period)
  const data = await readReport(client, businessId, filter)
  const stock: StockSnapshot[] = []
  for (let start = 0; start <= 5000; start += 500) {
    const { data: rows, error } = await client.from('catalog_products').select('id,name,unit,stock,minimum_stock,active').eq('business_id', businessId).order('id').range(start, start + 499).abortSignal(AbortSignal.timeout(10000))
    if (error || !rows) throw Error('Data stok belum dapat dibaca.')
    stock.push(...rows)
    if (stock.length > 5000) throw Error('Analisis stok saat ini dibatasi 5.000 produk. Gunakan Inventori untuk memeriksa seluruh katalog.')
    if (rows.length < 500) return buildAssistantContext(data, stock, filter, new Date().toISOString())
  }
  throw Error('Data stok melebihi batas analisis.')
}
