import { redirect } from 'next/navigation'
import { requireBusiness } from '@/lib/access'
import { readReservations } from '@/lib/restaurant-reservations-server'
import { reservationIso } from '@/lib/restaurant-reservations'
import RestaurantReservations from '@/components/restaurant-reservations'

export default async function ReservationsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {business,supabase,member}=await requireBusiness(['owner','admin','cashier'])
  if(business.category!=='restaurant')redirect('/dashboard')
  const query=await searchParams, fallback=new Date(Date.now()+7*3600000).toISOString().slice(0,10)
  let day=typeof query.day==='string'?query.day:fallback
  try{reservationIso(day+'T00:00')}catch{day=fallback}
  const page=typeof query.page==='string'&&/^\d{1,6}$/.test(query.page)?Number(query.page):0
  return <RestaurantReservations member={member} day={day} data={await readReservations(supabase,business.id,day,page)}/>
}
