import { z } from 'zod'
import type { BusinessLocation } from './business-regions'

export const mapPointSchema = z.object({ latitude: z.number().finite().min(-11.5).max(6.5), longitude: z.number().finite().min(94.5).max(141.5) }).strict()
export type MapPoint = z.infer<typeof mapPointSchema>
export type MapAddress = MapPoint & BusinessLocation & { address: string; display: string; incomplete: boolean }
export const locationRequestSchema = z.discriminatedUnion('mode', [
  mapPointSchema.extend({ mode: z.literal('reverse') }).strict(),
  z.object({ mode: z.literal('search'), query: z.string().trim().min(3).max(200) }).strict(),
])
const coordinate = (minimum: number, maximum: number) => z.preprocess(value => value === '' || value === undefined || value === null ? null : typeof value === 'string' ? Number(value) : value, z.number().finite().min(minimum).max(maximum).nullable())
export const profileCoordinates = {
  latitude: coordinate(-11.5, 6.5), longitude: coordinate(94.5, 141.5),
}
export function coordinatePairProblem(value: { latitude: number | null; longitude: number | null }) {
  return (value.latitude === null) !== (value.longitude === null) ? 'Latitude dan longitude harus diisi berpasangan.' : null
}
