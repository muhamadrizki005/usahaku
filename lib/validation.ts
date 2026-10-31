import { z } from 'zod';

export const passwordSchema = z.string().min(10, 'Gunakan minimal 10 karakter.').max(128, 'Maksimal 128 karakter.');
export const ownerLoginSchema = z.object({ email: z.email('Email tidak valid.').max(254), password: z.string().min(1, 'Isi kata sandi.').max(128) });
export const registerSchema = ownerLoginSchema.extend({ name: z.string().trim().min(2, 'Isi nama lengkap.').max(100), phone: z.string().trim().max(30).optional(), password: passwordSchema, confirmation: z.string() }).refine(data => data.password === data.confirmation, { message: 'Konfirmasi kata sandi belum sama.', path: ['confirmation'] });
export const businessSchema = z.object({ name: z.string().trim().min(2, 'Nama usaha minimal 2 karakter.').max(100), ownerName: z.string().trim().min(2).max(100), phone: z.string().trim().max(30), address: z.string().trim().max(500) });
export const staffSchema = z.object({ name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(100), username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, 'Username: 3–24 huruf kecil, angka, atau garis bawah.'), role: z.enum(['admin', 'cashier']) });
export const staffLoginSchema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8}$/, 'Kode toko terdiri dari 8 karakter.'), username: staffSchema.shape.username, password: z.string().min(1).max(128) });
export function staffEmail(code: string, username: string) {
  return `${code.toLowerCase()}.${username.toLowerCase()}@staff.usahaku.invalid`;
}
export type Member = { id: string; business_id: string; user_id: string; name: string; username: string | null; role: 'owner' | 'admin' | 'cashier'; active: boolean; must_change_password: boolean; created_at: string };
export type Business = { id: string; name: string; code: string; category: string; phone: string; address: string; onboarding_completed_at?: string | null; street_address?: string; city?: string; province?: string; district?: string; village?: string; description?: string; logo_path?: string | null; profile_revision?: number; operating_hours?: import('./business-profile').BusinessHours | null; hours_revision?: number };
export type ActionState = { error?: string; success?: string; warning?: string; temporaryPassword?: string; business?: Business };
