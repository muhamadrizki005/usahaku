import {requireBusiness} from '@/lib/access'
import {redirect} from 'next/navigation'
import {readProducts} from '@/lib/catalog-server'
import PosManagement from '@/components/pos-management'
import RestaurantOrders from '@/components/restaurant-orders'
import {readBusinessPayments} from '@/lib/business-payments-server'
import { readRestaurantMenu, readRestaurantTables, readRestaurantOrdersPage, readRestaurantUsage } from '@/lib/restaurant-server'
import { readReservation } from '@/lib/restaurant-reservations-server'
import { readRestaurantBilling } from '@/lib/restaurant-billing-server'
import { z } from 'zod'
export default async function PosPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {supabase,business,member}=await requireBusiness(undefined, false, 'pos:view')
 if(business.category==='barbershop')redirect('/dashboard/salon/appointments')
 if(business.category==='restaurant') {
  const query=await searchParams, key=z.uuid().safeParse(query.reservation)
  const reservation=key.success?await readReservation(supabase,business.id,key.data):null
  const available=reservation&&['reserved','seated'].includes(reservation.status)?reservation:null
  const linked=available?await supabase.from('restaurant_orders').select('*').eq('business_id',business.id).eq('reservation_id',available.id).maybeSingle():null
  if(linked?.error)throw Error('Pesanan reservasi belum dapat dimuat. Muat ulang sebelum menambahkan pesanan.')
  return <RestaurantOrders payments={await readBusinessPayments(supabase,business.id)} billing={await readRestaurantBilling(supabase,business.id)} member={member} menu={await readRestaurantMenu(supabase,business.id)} tables={await readRestaurantTables(supabase,business.id)} initialPage={await readRestaurantOrdersPage(supabase,business.id)} usage={await readRestaurantUsage(supabase,business.id)} reservation={available} linkedOrder={linked?.data?{...linked.data,deposit_amount:Number(available?.deposit_amount || 0)-Number(available?.deposit_refunded || 0)}:null} reservationError={Boolean(query.reservation)&&!available?'Reservasi tidak tersedia atau akses ditolak. Periksa daftar reservasi.':undefined}/>
 }
 return <PosManagement business={business} member={member} initialCategory="toko" initialProducts={await readProducts(supabase,business.id)} initialPayments={await readBusinessPayments(supabase,business.id)} renderedAt={new Date().toISOString()} />
}
