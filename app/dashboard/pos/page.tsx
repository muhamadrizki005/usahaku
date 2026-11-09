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
  const [payments,billing,menu,tables,initialPage,usage]=await Promise.all([
    readBusinessPayments(supabase,business.id),readRestaurantBilling(supabase,business.id),
    readRestaurantMenu(supabase,business.id),readRestaurantTables(supabase,business.id),
    readRestaurantOrdersPage(supabase,business.id),readRestaurantUsage(supabase,business.id),
  ])
  return <RestaurantOrders payments={payments} billing={billing} member={member} menu={menu} tables={tables} initialPage={initialPage} usage={usage} reservation={available} linkedOrder={linked?.data?{...linked.data,deposit_amount:Number(available?.deposit_amount || 0)-Number(available?.deposit_refunded || 0)}:null} reservationError={Boolean(query.reservation)&&!available?'Reservasi tidak tersedia atau akses ditolak. Periksa daftar reservasi.':undefined}/>
 }
 const [products,payments]=await Promise.all([readProducts(supabase,business.id),readBusinessPayments(supabase,business.id)])
 return <PosManagement business={business} member={member} initialCategory="toko" initialProducts={products} initialPayments={payments} renderedAt={new Date().toISOString()} />
}
