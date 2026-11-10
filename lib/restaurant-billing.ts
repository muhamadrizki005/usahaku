import { z } from 'zod'
import type { LoyaltyRedemptionRule } from './loyalty'

const rate = z.string().regex(/^(0|[1-9]\d{0,2})(\.\d{1,2})?$/, 'Isi persentase 0–100, maksimal 2 desimal.').refine(v => Number(v) <= 100, 'Persentase maksimal 100%.')
export const restaurantBillingSchema = z.object({ taxRate: rate, serviceRate: rate, taxBase: z.enum(['net', 'net_service']), serviceScope: z.enum(['dine_in', 'all']) }).strict()
export type RestaurantBilling = { tax_rate: number; service_rate: number; tax_base: 'net' | 'net_service'; service_scope: 'dine_in' | 'all'; revision: number; loyalty_active?: boolean; earn_nominal?: number; redemption_active?: boolean; point_value?: number; redemptions?:LoyaltyRedemptionRule[] }
export function restaurantRewardQuote(subtotal:number,discountKind:string,discountValue:string,kind:'dine_in'|'takeaway',settings:RestaurantBilling,reward:LoyaltyRedemptionRule|null,balance:number,lines:{id:string;price:number}[]){
 const base=restaurantQuote(subtotal,discountKind,discountValue,kind,settings)
 let cut=0,redeemed=0
 if(reward){
  if(!settings.loyalty_active||!Number.isSafeInteger(reward.points_required)||reward.points_required<1||reward.points_required>balance)throw Error('Saldo poin tidak cukup atau program poin tidak aktif.')
  redeemed=reward.points_required
  const value=reward.reward_type==='voucher'?reward.voucher_amount:reward.reward_type==='product'?Number(lines.find(l=>l.id===reward.product_id)?.price):0
  if(!Number.isSafeInteger(value)||!value||value<1)throw Error('Tambahkan menu hadiah atau pilih voucher yang valid.')
  cut=Math.min(base.net,value)
  if(cut<=0)throw Error('Hadiah tidak berlaku untuk tagihan nol.')
 }
 const result=restaurantQuote(subtotal,'amount',String(base.discount+cut),kind,settings)
 return{...result,orderDiscount:base.discount,pointDiscount:cut,pointsRedeemed:redeemed,pointsEarned:settings.loyalty_active?Math.floor(result.total/Number(settings.earn_nominal||10000)):0}
}
export const defaultRestaurantBilling: RestaurantBilling = { tax_rate: 0, service_rate: 0, tax_base: 'net', service_scope: 'dine_in', revision: 0 }
export function restaurantMemberQuote(subtotal:number,discountKind:string,discountValue:string,kind:'dine_in'|'takeaway',settings:RestaurantBilling,points:string,balance:number) {
  const base=restaurantQuote(subtotal,discountKind,discountValue,kind,settings)
  if(!/^(0|[1-9]\d{0,15})$/.test(points)||!Number.isSafeInteger(Number(points))||!Number.isSafeInteger(balance)||balance<0)throw Error('Nominal poin tidak valid.')
  const redeemed=Number(points),value=Number(settings.point_value||0)
  if(redeemed>0&&(!settings.redemption_active||!Number.isSafeInteger(value)||value<1))throw Error('Penukaran poin belum aktif.')
  if(redeemed>balance)throw Error('Saldo poin tidak cukup.')
  const cut=BigInt(redeemed)*BigInt(value)
  if(cut>BigInt(base.net))throw Error('Potongan poin melebihi subtotal setelah diskon.')
  const result=restaurantQuote(subtotal,'amount',String(base.discount+Number(cut)),kind,settings)
  return {...result,orderDiscount:base.discount,pointDiscount:Number(cut),pointsRedeemed:redeemed,pointsEarned:settings.loyalty_active?Math.floor(result.total/Number(settings.earn_nominal||10000)):0}
}
const percent = (amount: bigint, value: number) => (amount * BigInt(Math.round(value * 100)) + BigInt(5000)) / BigInt(10000)
export function restaurantQuote(subtotal: number, discountKind: string, discountValue: string, kind: 'dine_in' | 'takeaway', settings: RestaurantBilling) {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0 || subtotal > 999999999999 || !['none','amount','percent'].includes(discountKind) || !/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(discountValue)) throw Error('Subtotal atau diskon tidak valid.')
  const value = Number(discountValue), gross = BigInt(subtotal)
  if ((discountKind === 'none' && value !== 0) || (discountKind === 'percent' && value > 100) || (discountKind === 'amount' && !Number.isSafeInteger(value))) throw Error('Periksa nilai diskon.')
  if (!Number.isFinite(settings.tax_rate) || !Number.isFinite(settings.service_rate) || settings.tax_rate < 0 || settings.tax_rate > 100 || settings.service_rate < 0 || settings.service_rate > 100) throw Error('Pengaturan tagihan tidak valid.')
  const discount = discountKind === 'amount' ? BigInt(value) : discountKind === 'percent' ? percent(gross, value) : BigInt(0)
  if (discount > gross) throw Error('Diskon melebihi subtotal.')
  const net = gross - discount, serviceRate = settings.service_scope === 'all' || kind === 'dine_in' ? settings.service_rate : 0
  const service = percent(net, serviceRate), taxBase = net + (settings.tax_base === 'net_service' ? service : BigInt(0)), tax = percent(taxBase, settings.tax_rate), total = net + service + tax
  if (total > BigInt(999999999999)) throw Error('Total melebihi batas transaksi.')
  return { discount: Number(discount), net: Number(net), service: Number(service), serviceRate, tax: Number(tax), taxBase: Number(taxBase), total: Number(total) }
}
