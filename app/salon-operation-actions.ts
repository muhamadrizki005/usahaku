'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSalon } from '@/lib/salon-server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Sale } from '@/lib/pos'
import { salonOperationSchema,salonBookingSchema,salonPaymentSchema,salonDepositSchema,salonOperationFailure,type SalonVisit,type SalonSettings } from '@/lib/salon-operations'

export async function salonVisitOperation(input:unknown,details:unknown):Promise<{value?:SalonVisit;error?:string;uncertain?:boolean}>{
 const {business,supabase}=await requireSalon()
 const p=salonOperationSchema.safeParse(input)
 if(!p.success)return{error:'Permintaan kunjungan tidak valid.'}
 const closeSchema=z.object({reason:z.string().trim().min(3,'Isi alasan minimal 3 karakter.').max(300),refundConfirmed:z.boolean().optional()}).strict()
 const schema=p.data.action==='save'?salonBookingSchema:p.data.action==='pay'?salonPaymentSchema:p.data.action==='deposit'?salonDepositSchema:p.data.action==='cancel'||p.data.action==='no_show'?closeSchema:z.object({}).strict()
 const d=schema.safeParse(details);if(!d.success)return{error:d.error.issues[0].message}
 const {data,error}=await supabase.rpc('salon_visit_operation',{target_id:business.id,item_id:p.data.id,expected_revision:p.data.revision,operation_id:p.data.request,action:p.data.action,details:d.data}).abortSignal(AbortSignal.timeout(15000)).retry(false)
 if(error||!data)return salonOperationFailure(error)
 revalidatePath('/dashboard','layout');return{value:data}
}

export async function saveSalonSettings(input:unknown,revision:number):Promise<{value?:SalonSettings;error?:string;uncertain?:boolean}>{
 const {business,supabase}=await requireSalon()
 const schema=z.object({buffer:z.string().regex(/^(0|[1-9]\d{0,2})$/).refine(v=>Number(v)<=120),taxRate:z.string().regex(/^(0|[1-9]\d{0,2})(\.\d{1,2})?$/).refine(v=>Number(v)<=100)}).strict(),p=schema.safeParse(input)
 if(!p.success||!Number.isSafeInteger(revision)||revision<0)return{error:'Isi jeda 0–120 menit dan pajak 0–100% (maksimal 2 desimal).'}
 const {data,error}=await supabase.rpc('save_salon_settings',{target_id:business.id,expected_revision:revision,details:p.data}).abortSignal(AbortSignal.timeout(15000)).retry(false)
 if(error||!data)return salonOperationFailure(error)
 revalidatePath('/dashboard','layout');return{value:data}
}

export type SalonCartCheckoutInput = {
  paymentType: 'full' | 'dp'
  practitionerId?: string
  customerId?: string | null
  customer: string
  phone?: string
  notes?: string
  kind: 'walk_in' | 'appointment'
  startsAt: string
  services: { id: string; name: string; price: number; duration: number; practitionerId?: string }[]
  products: { id: string; name: string; price: number; quantity: number; unit?: string; productRevision?: number }[]
  paymentMethod: 'cash' | 'qris' | 'transfer' | 'ewallet'
  cashReceived: number
  discountKind: 'none' | 'percent' | 'amount'
  discountValue: number
  dpAmount?: number
  taxes?: { id: string; name: string; rate: number; amount: number }[]
}

export async function checkoutSalonCart(payload: SalonCartCheckoutInput): Promise<{
  visit?: SalonVisit
  sale?: Sale
  error?: string
}> {
  const { business, member, user } = await requireSalon()
  const admin = createAdminClient()

  const {
    paymentType,
    practitionerId,
    customerId,
    customer,
    phone,
    notes,
    kind,
    startsAt,
    services,
    products,
    paymentMethod,
    cashReceived,
    discountKind,
    discountValue,
    dpAmount,
    taxes,
  } = payload

  const customerName = (customer && customer.trim()) || 'Pelanggan Umum'
  const contactPhone = (phone && phone.trim()) || ''
  const visitNotes = (notes && notes.trim()) || ''

  const servicesSubtotal = services.reduce((sum, s) => sum + s.price, 0)
  const productsSubtotal = products.reduce((sum, p) => sum + p.price * p.quantity, 0)
  const totalSubtotal = servicesSubtotal + productsSubtotal
  const totalDuration = services.reduce((sum, s) => sum + (s.duration || 30), 0)

  let reduction = 0
  if (discountKind === 'percent') {
    reduction = Math.round((totalSubtotal * Math.min(100, Math.max(0, discountValue))) / 100)
  } else if (discountKind === 'amount') {
    reduction = Math.min(totalSubtotal, Math.max(0, discountValue))
  }
  const netBeforeTax = Math.max(0, totalSubtotal - reduction)

  const taxAmount = taxes && taxes.length > 0 ? taxes.reduce((sum, t) => sum + t.amount, 0) : 0
  const taxRate = taxes && taxes.length > 0 ? taxes[0].rate : (business.tax_rate || 0)
  const grandTotal = netBeforeTax + taxAmount

  let practitionerName = 'Penata Salon'
  if (practitionerId) {
    const { data: prac } = await admin
      .from('salon_practitioners')
      .select('name')
      .eq('id', practitionerId)
      .eq('business_id', business.id)
      .maybeSingle()
    if (prac?.name) practitionerName = prac.name
  }

  const { data: salonConfig } = await admin
    .from('salon_settings')
    .select('buffer_minutes')
    .eq('business_id', business.id)
    .maybeSingle()
  const bufferMinutes = Number(salonConfig?.buffer_minutes) || 0

  let startsDate = new Date(startsAt)
  if (isNaN(startsDate.getTime())) startsDate = new Date()
  const finishesDate = new Date(startsDate.getTime() + (totalDuration || 30) * 60000)
  const holdUntilDate = new Date(finishesDate.getTime() + bufferMinutes * 60000)

  const serviceLines = services.map(s => ({
    id: s.id,
    name: s.name,
    sku: '',
    unit: 'layanan',
    price: s.price,
    quantity: 1,
    total: s.price,
    duration: s.duration || 30,
    revision: 1,
  }))

  const productLines = products.map(p => ({
    id: p.id,
    name: p.name,
    sku: '',
    unit: p.unit || 'pcs',
    price: p.price,
    quantity: p.quantity,
    total: p.price * p.quantity,
    revision: p.productRevision || 0,
  }))

  const allLines = [...serviceLines, ...productLines]

  if (paymentType === 'dp') {
    const depositNum = Number(dpAmount) || 0
    if (depositNum <= 0) {
      return { error: 'Nominal DP harus lebih besar dari Rp0.' }
    }
    const maxDpAllowed = servicesSubtotal > 0 ? servicesSubtotal : grandTotal
    if (depositNum > maxDpAllowed) {
      return { error: `Nominal DP tidak boleh melebihi tagihan layanan (${maxDpAllowed.toLocaleString('id-ID')}).` }
    }

    const visitId = crypto.randomUUID()
    const visitData = {
      id: visitId,
      business_id: business.id,
      actor_id: user.id,
      actor_name: member.name,
      practitioner_id: practitionerId,
      practitioner_name: practitionerName,
      customer_id: customerId || null,
      customer: customerName,
      phone: contactPhone,
      notes: visitNotes,
      kind: kind,
      starts_at: startsDate.toISOString(),
      ends_at: finishesDate.toISOString(),
      buffer_minutes: bufferMinutes,
      busy_until: holdUntilDate.toISOString(),
      lines: serviceLines.length > 0 ? serviceLines : allLines,
      subtotal: servicesSubtotal > 0 ? servicesSubtotal : totalSubtotal,
      status: kind === 'appointment' ? 'scheduled' : 'waiting',
      arrived_at: kind === 'walk_in' ? new Date().toISOString() : null,
      started_at: null,
      finished_at: null,
      deposit_amount: depositNum,
      deposit_payment: paymentMethod,
      deposit_at: new Date().toISOString(),
      deposit_refunded: 0,
      sale_id: null,
      revision: 1,
    }

    const { data: savedVisit, error: visitErr } = await admin
      .from('salon_visits')
      .insert(visitData)
      .select('*')
      .single()

    if (visitErr || !savedVisit) {
      return { error: 'Gagal mencatat DP kunjungan: ' + (visitErr?.message || 'DB error') }
    }

    revalidatePath('/dashboard', 'layout')
    return { visit: savedVisit as SalonVisit }
  }

  // Full Payment (Lunas)
  const saleId = crypto.randomUUID()
  const numCash = paymentMethod === 'cash' ? Number(cashReceived) || grandTotal : grandTotal
  const change = Math.max(0, numCash - grandTotal)
  const receiptNum = 'SLN-' + saleId.slice(0, 8).toUpperCase()

  let pointsEarned = 0
  if (customerId && business.loyalty_active && business.loyalty_point_nominal && business.loyalty_point_nominal > 0) {
    pointsEarned = Math.floor(grandTotal / business.loyalty_point_nominal)
  }

  const transactionData = {
    id: saleId,
    business_id: business.id,
    actor_id: user.id,
    actor_name: member.name,
    customer_id: customerId || null,
    customer: customerName,
    lines: allLines,
    subtotal: totalSubtotal,
    discount_kind: discountKind,
    discount_value: discountValue,
    discount: reduction,
    total: grandTotal,
    payment: paymentMethod,
    received: numCash,
    change: change,
    status: 'completed',
    tax_rate: taxRate,
    tax_amount: taxAmount,
    service_rate: 0,
    service_amount: 0,
    tax_base: 'net',
    receipt_number: receiptNum,
    points_earned: pointsEarned,
    deposit_amount: 0,
    deposit_payment: null,
    balance_received: grandTotal,
    product_discount: 0,
    order_discount: reduction,
  }

  const { data: savedSale, error: saleErr } = await admin
    .from('pos_transactions')
    .insert(transactionData)
    .select('*')
    .single()

  if (saleErr || !savedSale) {
    return { error: 'Gagal memproses transaksi kasir salon: ' + (saleErr?.message || 'DB error') }
  }

  let savedVisit: SalonVisit | undefined = undefined
  if (services.length > 0) {
    const visitId = crypto.randomUUID()
    const visitData = {
      id: visitId,
      business_id: business.id,
      actor_id: user.id,
      actor_name: member.name,
      practitioner_id: practitionerId,
      practitioner_name: practitionerName,
      customer_id: customerId || null,
      customer: customerName,
      phone: contactPhone,
      notes: visitNotes,
      kind: kind,
      starts_at: startsDate.toISOString(),
      ends_at: finishesDate.toISOString(),
      buffer_minutes: bufferMinutes,
      busy_until: holdUntilDate.toISOString(),
      lines: serviceLines,
      subtotal: servicesSubtotal,
      status: 'finished',
      arrived_at: new Date().toISOString(),
      started_at: startsDate.toISOString(),
      finished_at: new Date().toISOString(),
      sale_id: saleId,
      deposit_amount: 0,
      deposit_payment: null,
      deposit_refunded: 0,
      revision: 1,
    }

    const { data: vData } = await admin
      .from('salon_visits')
      .insert(visitData)
      .select('*')
      .single()

    if (vData) {
      savedVisit = vData as SalonVisit
    }
  }

  if (customerId && pointsEarned > 0) {
    try {
      const { data: cust } = await admin.from('customers').select('points').eq('id', customerId).single()
      const newPoints = (Number(cust?.points) || 0) + pointsEarned
      await admin.from('customers').update({ points: newPoints }).eq('id', customerId)
      await admin.from('customer_point_history').insert({
        business_id: business.id,
        customer_id: customerId,
        actor_id: user.id,
        transaction_id: saleId,
        delta: pointsEarned,
        balance_after: newPoints,
        reason: 'Poin transaksi salon ' + receiptNum,
      })
      ;(savedSale as any).customer_points = newPoints
    } catch (err) {
      console.error('Failed to update customer loyalty points:', err)
    }
  }

  revalidatePath('/dashboard', 'layout')
  return {
    sale: savedSale as Sale,
    visit: savedVisit,
  }
}
