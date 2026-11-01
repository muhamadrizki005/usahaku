'use server'
import { revalidatePath } from 'next/cache'
import { requireBusiness } from '@/lib/access'
export async function saveStoreTax(rate: string, revision: number) {
  const { supabase, business } = await requireBusiness(['owner'])
  if (business.category !== 'store' || !/^(0|[1-9]\d{0,2})(\.\d{1,2})?$/.test(rate) || Number(rate) > 100 || !Number.isSafeInteger(revision) || revision < 0) return { error: 'Isi pajak 0–100%, maksimal 2 desimal.' }
  const { data, error } = await supabase.rpc('save_store_tax', { target_id: business.id, expected_version: revision, rate: Number(rate) }).abortSignal(AbortSignal.timeout(15000)).retry(false)
  if (error || !data) return { error: error?.code === 'PT409' ? 'Pajak telah berubah. Muat ulang sebelum menyimpan.' : error?.code === 'PGRST202' ? 'Migrasi pajak belum terpasang.' : 'Penyimpanan pajak belum dapat dipastikan. Muat ulang untuk memeriksa.' }
  revalidatePath('/dashboard', 'layout')
  return { rate: Number(data.rate), revision: Number(data.revision) }
}
