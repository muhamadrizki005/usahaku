import { z } from 'zod'
import { businessHoursSchema, type BusinessHours } from './business-profile'

export type SalonService = { id: string; business_id: string; name: string; price: number; duration_minutes: number; active: boolean; revision: number }
export type SalonPractitioner = { id: string; business_id: string; name: string; active: boolean; schedule: BusinessHours | null; service_ids: string[]; revision: number }
export type SalonFoundation = { services: SalonService[]; practitioners: SalonPractitioner[] }
export const salonServiceSchema = z.object({ name: z.string().trim().min(1,'Isi nama layanan.').max(100), price: z.string().regex(/^(0|[1-9]\d{0,11})$/,'Isi harga rupiah bulat, minimal 0.'), duration: z.string().regex(/^[1-9]\d{0,2}$/,'Isi durasi 1 sampai 720 menit.').refine(v=>Number(v)<=720,'Durasi maksimal 720 menit.'), active: z.boolean() }).strict()
export const salonPractitionerSchema = z.object({ name: z.string().trim().min(1,'Isi nama penata/terapis.').max(100), active: z.boolean(), serviceIds: z.array(z.uuid()).max(100).refine(v=>new Set(v).size===v.length,'Layanan tidak boleh berulang.'), schedule: businessHoursSchema.nullable() }).strict()
export const salonRequestSchema = z.object({ id: z.uuid(), revision: z.number().int().positive().nullable(), request: z.uuid(), resource: z.enum(['service','practitioner']) }).strict()
export type SalonResult = { value?: SalonService | SalonPractitioner; error?: string; uncertain?: boolean }
export function salonFailure(error: { code?: string; message?: string } | null): SalonResult {
  if(error?.code==='42501')return {error:'Hanya owner/admin salon yang boleh mengubah data ini.'}
  if(error?.code==='PT409')return {error:'Data berubah di tab lain. Tutup formulir dan muat ulang sebelum menyimpan.'}
  if(error?.code==='23505'&&/salon_(service|practitioner)_name/.test(error.message||''))return {error:'Nama sudah digunakan. Pilih nama lain atau ubah data yang sudah ada.'}
  if(['22023','22P02','23514','23503'].includes(error?.code||''))return {error:'Periksa nama, harga, durasi, pilihan layanan dan jadwal kerja.'}
  if(error?.code==='PGRST202')return {error:'Layanan salon belum tersedia. Hubungi pengelola untuk memeriksa migrasi.'}
  if(error?.code==='54000')return {error:'Jumlah data salon mencapai batas tampilan. Hubungi pengelola sebelum menambahkan data lagi.'}
  return {error:'Hasil penyimpanan belum pasti. Ulangi permintaan yang sama atau muat ulang untuk memeriksa.',uncertain:true}
}
