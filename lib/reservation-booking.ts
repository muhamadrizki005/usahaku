import { z } from 'zod'
import { restaurantOrderSchema } from './restaurant'

export const reservationBookingExtras = z.object({
  meal: z.object({ lines: restaurantOrderSchema.shape.lines, notes: z.string().trim().max(300) }).strict().nullable(),
  deposit: z.object({
    amount: z.string().regex(/^[1-9]\d{0,11}$/, 'Isi nominal DP rupiah bulat lebih dari nol.'),
    payment: z.enum(['cash', 'qris', 'transfer']),
    confirmed: z.literal(true, { error: 'Konfirmasi DP yang benar-benar sudah diterima.' }),
  }).strict().nullable(),
}).strict()
