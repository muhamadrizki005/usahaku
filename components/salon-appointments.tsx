'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { salonVisitOperation, checkoutSalonCart } from '@/app/salon-operation-actions'
import { checkoutPos } from '@/app/pos-actions'
import { moveCatalogStock } from '@/app/catalog-actions'
import { CustomerSearch } from './customer-search'
import PosCustomerPicker from './pos-customer-picker'
import type { PosCustomer } from '@/lib/customers'
import type { Business, Member } from '@/lib/validation'
import type { SalonFoundation, SalonPractitioner, SalonService } from '@/lib/salon'
import {
  salonStatuses,
  salonQuote,
  type SalonVisit,
  type SalonVisitPage,
  type SalonBusySlot,
  type SalonSettings,
} from '@/lib/salon-operations'
import { type LoyaltyRedemptionRule, getLoyaltyRedemptions } from '@/lib/loyalty'
import { enabledPaymentMethods, type PaymentSettings } from '@/lib/business-payments'
import { rupiah, saleDate, saleCode, paymentLabel, type Sale } from '@/lib/pos'
import { reservationIso, reservationLocalTime } from '@/lib/restaurant-reservations'
import DashboardSection from './dashboard-section'
import { DatePicker } from './ui/date-picker'
import { SelectInput } from './ui/select-input'
import { NumericInput } from './ui/numeric-input'
import {
  RestaurantDialog,
  RestaurantField,
  restaurantPanel as panel,
  restaurantInput as input,
  restaurantButton as button,
  restaurantPrimary as primary,
} from './restaurant-forms'
import RestaurantPaymentFields from './restaurant-payment-fields'
import {
  Sparkles,
  Package,
  Scissors,
  CalendarDays,
  ShoppingBag,
  Trash2,
  ChevronUp,
  ChevronDown,
  Printer,
  CheckCircle2,
  Banknote,
  Clock,
  User,
  Tag,
  Search,
  Plus,
} from 'lucide-react'
import { notify, showSuccessToast, showErrorToast } from '@/lib/notifications'
import { createPortal } from 'react-dom'
import SaleReceipt from './sale-receipt'
import { getBusinessTaxes, calculateCustomTaxes, type CustomTaxItem } from '@/lib/business-taxes'
import type { CatalogProduct } from '@/lib/catalog'
import {
  type SalonDiscount,
  calculateDiscountedPrice,
  getServiceDiscount,
  getProductDiscount,
  getProductDescription,
  getProductPhoto,
  getServiceBenefits,
} from '@/lib/salon-benefits'

type Props = {
  business: Business
  member: Member
  foundation: SalonFoundation
  visits: SalonVisitPage
  busySlots: SalonBusySlot[]
  settings: SalonSettings
  payments: PaymentSettings
  products?: CatalogProduct[]
  day: string
}

type Dialog =
  | { kind: 'edit'; visit: SalonVisit | null; walkIn?: boolean }
  | { kind: 'detail'; visit: SalonVisit | null }
  | { kind: 'deposit'; visit: SalonVisit }
  | { kind: 'pay'; visit: SalonVisit }
  | { kind: 'cancel'; visit: SalonVisit }

type CartItem = {
  id: string
  kind: 'service' | 'product'
  name: string
  price: number // base price
  discountedPrice: number
  discountInfo: SalonDiscount | null
  quantity: number // for product
  unit?: string // for product
  duration?: number // for service in minutes
  photo?: string
  practitionerId?: string // for service
  stock?: number // for product
  productRevision?: number
}

type CompletedSaleReceipt = {
  code: string
  date: string
  customer: string
  customerPhone?: string
  cashier: string
  items: {
    name: string
    quantity: number
    unit?: string
    price: number
    total: number
    practitionerName?: string
  }[]
  subtotal: number
  itemDiscount: number
  transDiscount: number
  tax: number
  total: number
  paymentMethod: string
  received: number
  change: number
  saleId?: string
  sale?: Sale
}

const time = (value: string) =>
  new Date(value).toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
  })

export default function SalonAppointments({
  business,
  member,
  foundation,
  visits,
  busySlots,
  settings,
  payments,
  products = [],
  day,
}: Props) {
  const router = useRouter()
  const [changing, startTransition] = useTransition()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [notice, setNotice] = useState('')
  const [operation, setOperation] = useState<{ visit: SalonVisit; action: string } | null>(null)

  // Service photos & discounts
  const [servicePhotos, setServicePhotos] = useState<Record<string, string>>({})
  const [serviceDiscounts, setServiceDiscounts] = useState<Record<string, SalonDiscount | null>>({})
  const [productDiscounts, setProductDiscounts] = useState<Record<string, SalonDiscount | null>>({})
  const [productPhotos, setProductPhotos] = useState<Record<string, string>>({})

  const servicesKey = foundation.services.map(s => s.id + ':' + s.revision).join(',')
  const productsKey = products.map(p => p.id + ':' + p.revision).join(',')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const loadMeta = () => {
      const sPhotos: Record<string, string> = {}
      const sDiscounts: Record<string, SalonDiscount | null> = {}
      foundation.services.forEach(s => {
        try {
          const p = localStorage.getItem('usahaku_service_photo_' + s.id)
          if (p) sPhotos[s.id] = p
        } catch { }
        sDiscounts[s.id] = getServiceDiscount(s.id, Number(s.price))
      })
      setServicePhotos(sPhotos)
      setServiceDiscounts(sDiscounts)

      const pPhotos: Record<string, string> = {}
      const pDiscounts: Record<string, SalonDiscount | null> = {}
      products.forEach(p => {
        pPhotos[p.id] = getProductPhoto(p.id) || p.image || ''
        pDiscounts[p.id] =
          getProductDiscount(p.id, p.price) ||
          (p.discountKind && p.discountKind !== 'none'
            ? {
              enabled: true,
              kind: p.discountKind,
              value: p.discountValue || 0,
              basePrice: p.price,
              discountedPrice: calculateDiscountedPrice(p.price, p.discountKind, p.discountValue || 0),
            }
            : null)
      })
      setProductPhotos(pPhotos)
      setProductDiscounts(pDiscounts)
    }

    loadMeta()
    window.addEventListener('storage', loadMeta)
    window.addEventListener('usahaku:service_discount_changed', loadMeta)
    window.addEventListener('usahaku:product_discount_changed', loadMeta)
    return () => {
      window.removeEventListener('storage', loadMeta)
      window.removeEventListener('usahaku:service_discount_changed', loadMeta)
      window.removeEventListener('usahaku:product_discount_changed', loadMeta)
    }
  }, [servicesKey, productsKey])

  // ===============================
  // POS & Cart State
  // ===============================
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'services' | 'products'>('all')

  const [cart, setCart] = useState<CartItem[]>([])
  const [txMode, setTxMode] = useState<'walk_in' | 'appointment'>('walk_in')
  const [appointmentStart, setAppointmentStart] = useState(() =>
    reservationLocalTime(new Date().toISOString())
  )
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomer | null>(null)
  const [customCustomerName, setCustomCustomerName] = useState('Pelanggan Umum')
  const [customerPhone, setCustomerPhone] = useState('')
  const [txNotes, setTxNotes] = useState('')
  const [cartPaymentOption, setCartPaymentOption] = useState<'full' | 'dp'>('full')
  const [dpAmountInput, setDpAmountInput] = useState<string>('')

  // Transaction-level discount
  const [transDiscountKind, setTransDiscountKind] = useState<'none' | 'percent' | 'amount'>('none')
  const [transDiscountValue, setTransDiscountValue] = useState('0')

  // Payment method & cash received
  const availablePaymentMethods = enabledPaymentMethods(payments)
  const [paymentMethod, setPaymentMethod] = useState<Sale['payment']>(
    availablePaymentMethods[0] || 'cash'
  )
  const [cashReceived, setCashReceived] = useState('')
  const [paymentConfirmed, setPaymentConfirmed] = useState(false)
  const [checkoutPending, setCheckoutPending] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [selectedRedemption, setSelectedRedemption] = useState<LoyaltyRedemptionRule | null>(null)
  const [availableRedemptions, setAvailableRedemptions] = useState<LoyaltyRedemptionRule[]>(() =>
    getLoyaltyRedemptions(business.id, business.loyalty_redemptions)
  )

  useEffect(() => {
    const sync = () => setAvailableRedemptions(getLoyaltyRedemptions(business.id, business.loyalty_redemptions))
    sync()
    window.addEventListener('usahaku:loyalty_redemptions_changed', sync)
    return () => window.removeEventListener('usahaku:loyalty_redemptions_changed', sync)
  }, [business.id, business.loyalty_redemptions])

  // Struk / Receipt Modal & Thermal Print
  const [receipt, setReceipt] = useState<CompletedSaleReceipt | null>(null)
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Item Detail Modal
  const [detailModal, setDetailModal] = useState<
    | { kind: 'service'; item: SalonService }
    | { kind: 'product'; item: CatalogProduct }
    | null
  >(null)

  // Custom Taxes
  const [customTaxes, setCustomTaxes] = useState<CustomTaxItem[]>(() =>
    getBusinessTaxes(business.id, 'barbershop', settings.tax_rate || 0)
  )
  useEffect(() => {
    const reload = () => setCustomTaxes(getBusinessTaxes(business.id, 'barbershop', settings.tax_rate || 0))
    window.addEventListener('storage', reload)
    window.addEventListener('usahaku:custom_taxes_changed', reload)
    return () => {
      window.removeEventListener('storage', reload)
      window.removeEventListener('usahaku:custom_taxes_changed', reload)
    }
  }, [business.id, settings.tax_rate])

  // Visits filter & pagination
  const [visitStatusFilter, setVisitStatusFilter] = useState<string>('all')

  const manage = member.role === 'owner' || member.role === 'admin'
  const activePractitioners = foundation.practitioners.filter(p => p.active)
  const calendarPractitioners = foundation.practitioners.filter(
    p => p.active || visits.items.some(v => v.practitioner_id === p.id)
  )

  // ===============================
  // Cart Actions
  // ===============================
  const addServiceToCart = (service: SalonService) => {
    if (!service.active) return
    const existing = cart.find(item => item.id === service.id && item.kind === 'service')
    if (existing) {
      showSuccessToast(`Layanan "${service.name}" sudah ada di keranjang.`)
      return
    }
    const discount = serviceDiscounts[service.id]
    const discountedPrice = discount ? discount.discountedPrice : Number(service.price)

    const defaultPractitioner =
      activePractitioners.find(p => p.service_ids.includes(service.id)) ||
      activePractitioners[0]

    setCart(prev => [
      ...prev,
      {
        id: service.id,
        kind: 'service',
        name: service.name,
        price: Number(service.price),
        discountedPrice,
        discountInfo: discount,
        quantity: 1,
        duration: service.duration_minutes,
        photo: servicePhotos[service.id],
        practitionerId: defaultPractitioner?.id,
      },
    ])
    showSuccessToast(`Layanan "${service.name}" ditambahkan ke keranjang.`)
  }

  const addProductToCart = (prod: CatalogProduct) => {
    if (!prod.active || prod.stock <= 0) {
      showErrorToast(`Stok "${prod.name}" habis.`)
      return
    }
    const existing = cart.find(item => item.id === prod.id && item.kind === 'product')
    if (existing && existing.quantity >= prod.stock) {
      showErrorToast(`Stok "${prod.name}" tersisa ${prod.stock} ${prod.unit}.`)
      return
    }
    const discount = productDiscounts[prod.id]
    const discountedPrice = discount ? discount.discountedPrice : prod.price

    setCart(prev => {
      const ex = prev.find(item => item.id === prod.id && item.kind === 'product')
      if (ex) {
        return prev.map(item =>
          item.id === prod.id && item.kind === 'product'
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [
        ...prev,
        {
          id: prod.id,
          kind: 'product',
          name: prod.name,
          price: prod.price,
          discountedPrice,
          discountInfo: discount,
          quantity: 1,
          unit: prod.unit,
          stock: prod.stock,
          photo: productPhotos[prod.id],
          productRevision: prod.revision,
        },
      ]
    })
    showSuccessToast(`Produk "${prod.name}" ditambahkan ke keranjang.`)
  }

  const updateProductQty = (productId: string, qty: number) => {
    setCart(prev =>
      prev.map(item => {
        if (item.id === productId && item.kind === 'product') {
          const maxStock = item.stock || 9999
          const next = Math.max(1, Math.min(maxStock, qty))
          return { ...item, quantity: next }
        }
        return item
      })
    )
  }

  const updateServicePractitioner = (serviceId: string, practitionerId: string) => {
    setCart(prev =>
      prev.map(item => {
        if (item.id === serviceId && item.kind === 'service') {
          return { ...item, practitionerId }
        }
        return item
      })
    )
  }

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(item => item.id !== itemId))
  }

  const clearCart = () => {
    setCart([])
    setTransDiscountKind('none')
    setTransDiscountValue('0')
    setCashReceived('')
    setPaymentConfirmed(false)
    setCheckoutError('')
    setSelectedRedemption(null)
  }

  // ===============================
  // Calculations
  // ===============================
  const rawSubtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const itemDiscountsTotal = cart.reduce(
    (sum, item) => sum + (item.price - item.discountedPrice) * item.quantity,
    0
  )
  const afterItemDiscountSubtotal = Math.max(0, rawSubtotal - itemDiscountsTotal)

  const numTransDiscount = Number(transDiscountValue) || 0
  let transDiscountReduction = 0
  if (transDiscountKind === 'percent') {
    transDiscountReduction = Math.round(
      (afterItemDiscountSubtotal * Math.min(100, Math.max(0, numTransDiscount))) / 100
    )
  } else if (transDiscountKind === 'amount') {
    transDiscountReduction = Math.min(afterItemDiscountSubtotal, Math.max(0, numTransDiscount))
  }

  let pointDiscountReduction = 0
  if (selectedRedemption) {
    if (selectedRedemption.reward_type === 'voucher') {
      pointDiscountReduction = Math.min(
        Math.max(0, afterItemDiscountSubtotal - transDiscountReduction),
        Number(selectedRedemption.voucher_amount || 0)
      )
    } else if (selectedRedemption.reward_type === 'product' && selectedRedemption.product_id) {
      const match = cart.find(i => i.id === selectedRedemption.product_id)
      if (match) {
        pointDiscountReduction = Math.min(
          Math.max(0, afterItemDiscountSubtotal - transDiscountReduction),
          match.discountedPrice || match.price
        )
      }
    } else if (selectedRedemption.reward_type === 'service' && selectedRedemption.service_id) {
      const match = cart.find(i => i.id === selectedRedemption.service_id)
      if (match) {
        pointDiscountReduction = Math.min(
          Math.max(0, afterItemDiscountSubtotal - transDiscountReduction),
          match.discountedPrice || match.price
        )
      }
    }
  }

  const netBeforeTax = Math.max(0, afterItemDiscountSubtotal - transDiscountReduction - pointDiscountReduction)
  const activeTaxes = calculateCustomTaxes(netBeforeTax, customTaxes)
  const taxAmount = activeTaxes.reduce((sum, t) => sum + t.amount, 0)
  const totalAmount = netBeforeTax + taxAmount

  const numCashReceived = Number(cashReceived) || 0
  const servicesInCart = cart.filter(i => i.kind === 'service')
  const productsInCart = cart.filter(i => i.kind === 'product')
  const payableTarget = cartPaymentOption === 'dp' && servicesInCart.length > 0
    ? (Number(dpAmountInput) || 0)
    : totalAmount
  const cashChange = Math.max(0, numCashReceived - payableTarget)

  // ===============================
  // Complete Checkout Flow
  // ===============================
  const handleCheckout = async (e: FormEvent) => {
    e.preventDefault()
    setCheckoutError('')

    if (!cart.length) {
      setCheckoutError('Keranjang belanja masih kosong.')
      return
    }

    if (!paymentConfirmed) {
      setCheckoutError('Harap konfirmasi pembayaran telah diterima dan diperiksa secara manual.')
      return
    }

    if (paymentMethod === 'cash' && numCashReceived < payableTarget) {
      setCheckoutError(`Nominal uang tunai yang diterima kurang dari total yang harus dibayar (${rupiah(payableTarget)}).`)
      return
    }




    // If services exist, ensure every service has a practitioner assigned
    if (servicesInCart.length > 0) {
      const missingPractitioner = servicesInCart.find(s => !s.practitionerId)
      if (missingPractitioner) {
        setCheckoutError(`Pilih penata/terapis untuk layanan "${missingPractitioner.name}".`)
        return
      }
    }

    setCheckoutPending(true)

    try {
      const customerName = selectedCustomer?.name || customCustomerName.trim() || 'Pelanggan Umum'
      const customerId = selectedCustomer?.id || null
      const contactPhone = selectedCustomer?.phone || customerPhone.trim()

      let generatedSaleCode = ''
      let saleId: string | undefined
      let completedSale: Sale | null = null

      // Scenario A: Cart has services (with or without products)
      if (servicesInCart.length > 0) {
        // Group services by practitioner if needed, or use primary practitioner
        const primaryPractitionerId = servicesInCart[0].practitionerId!
        const visitId = crypto.randomUUID()
        const startsAt =
          txMode === 'walk_in'
            ? reservationLocalTime(new Date().toISOString())
            : appointmentStart

        const startsAtIso = reservationIso(startsAt)

        if (cartPaymentOption === 'dp') {
          const dpNum = Number(dpAmountInput) || 0
          if (dpNum <= 0) {
            setCheckoutError('Masukkan nominal DP yang valid lebih dari Rp0.')
            return
          }
          const maxDp = servicesInCart.reduce((s, i) => s + (i.discountedPrice || i.price), 0)
          if (dpNum > maxDp) {
            setCheckoutError('Nominal DP tidak boleh melebihi tagihan layanan (' + rupiah(maxDp) + ').')
            return
          }

          const res = await checkoutSalonCart({
            paymentType: 'dp',
            practitionerId: primaryPractitionerId,
            customerId,
            customer: customerName,
            phone: contactPhone,
            notes: txNotes.trim(),
            kind: txMode,
            startsAt: startsAtIso,
            services: servicesInCart.map(s => ({
              id: s.id,
              name: s.name,
              price: s.discountedPrice || s.price,
              duration: s.duration || 30,
              practitionerId: s.practitionerId,
            })),
            products: productsInCart.map(p => ({
              id: p.id,
              name: p.name,
              price: p.discountedPrice || p.price,
              quantity: p.quantity,
              unit: p.unit || 'pcs',
              productRevision: p.productRevision || 0,
            })),
            paymentMethod,
            cashReceived: numCashReceived,
            discountKind: transDiscountKind,
            discountValue: numTransDiscount,
            dpAmount: dpNum,
            taxes: activeTaxes,
          })

          if (res.error) throw new Error(res.error)

          notify({
            title: 'DP Kunjungan Berhasil Dicatat',
            message: 'DP ' + customerName + ' sebesar ' + rupiah(dpNum) + ' (' + (paymentLabel[paymentMethod] || paymentMethod) + ') berhasil dicatat ke daftar kunjungan.',
            category: 'transaction',
          })

          clearCart()
          router.refresh()
          return
        }

        // Full Payment (Lunas)
        const res = await checkoutSalonCart({
          paymentType: 'full',
          practitionerId: primaryPractitionerId,
          customerId,
          customer: customerName,
          phone: contactPhone,
          notes: txNotes.trim(),
          kind: txMode,
          startsAt: startsAtIso,
          services: servicesInCart.map(s => ({
            id: s.id,
            name: s.name,
            price: s.discountedPrice || s.price,
            duration: s.duration || 30,
            practitionerId: s.practitionerId,
          })),
          products: productsInCart.map(p => ({
            id: p.id,
            name: p.name,
            price: p.discountedPrice || p.price,
            quantity: p.quantity,
            unit: p.unit || 'pcs',
            productRevision: p.productRevision || 0,
          })),
          paymentMethod,
          cashReceived: numCashReceived,
          discountKind: transDiscountKind,
          discountValue: numTransDiscount,
          taxes: activeTaxes,
          pointsRedeemed: selectedRedemption ? selectedRedemption.points_required : 0,
          redemptionReason: selectedRedemption ? `Tukar ${selectedRedemption.points_required} poin: ${selectedRedemption.reward_type === 'voucher' ? `Voucher Rp${(selectedRedemption.voucher_amount || 0).toLocaleString('id-ID')}` : (selectedRedemption.product_name || selectedRedemption.service_name || 'Hadiah')}` : undefined,
        })

        if (res.error) throw new Error(res.error)
        saleId = res.sale?.id
        completedSale = res.sale || null
        setReceiptSale(res.sale || null)
        generatedSaleCode = res.sale?.receipt_number || ('SLN-' + (res.sale?.id || '').slice(0, 8).toUpperCase())

        // Deduct physical products if bought alongside services
        for (const p of productsInCart) {
          try {
            const form = new FormData()
            form.append('id', p.id)
            form.append('request', crypto.randomUUID())
            form.append('revision', String(p.productRevision ?? 0))
            form.append('kind', 'out')
            form.append('delta', String(p.quantity))
            form.append('reason', 'Penjualan kasir salon untuk ' + customerName)
            await moveCatalogStock(form)
          } catch { }
        }
      } else {
        // Scenario B: Pure product sale (e.g. buying pomade directly)
        const productLines = productsInCart.map(p => ({
          product: {
            id: p.id,
            name: p.name,
            category: 'Produk Salon',
            unit: p.unit || 'pcs',
            sku: '',
            barcode: '',
            price: p.price,
            stock: p.stock || 0,
            minStock: 0,
            active: true,
            revision: p.productRevision || 0,
          },
          quantity: p.quantity,
        }))

        const result = await checkoutPos(crypto.randomUUID(), {
          lines: productLines,
          payment: paymentMethod,
          received: paymentMethod === 'cash' ? numCashReceived : totalAmount,
          customer_id: customerId,
          customer: customerName,
          confirmed: true,
          discount_kind: transDiscountKind,
          discount_value: numTransDiscount,
          pointsRedeemed: selectedRedemption ? selectedRedemption.points_required : 0,
          redemptionReason: selectedRedemption ? `Tukar ${selectedRedemption.points_required} poin: ${selectedRedemption.reward_type === 'voucher' ? `Voucher Rp${(selectedRedemption.voucher_amount || 0).toLocaleString('id-ID')}` : (selectedRedemption.product_name || selectedRedemption.service_name || 'Hadiah')}` : undefined,
        })

        if (!result.sale) {
          throw new Error(result.error || 'Gagal memproses transaksi produk kasir.')
        }

        saleId = result.sale.id
        completedSale = result.sale || null
        setReceiptSale(result.sale || null)
        generatedSaleCode = saleCode(result.sale) || 'SLN-' + crypto.randomUUID().slice(0, 8).toUpperCase()
      }

      // Build receipt object
      const receiptData: CompletedSaleReceipt = {
        code: generatedSaleCode,
        date: new Date().toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Jakarta',
        }),
        customer: customerName,
        customerPhone: contactPhone,
        cashier: member.name,
        items: cart.map(item => {
          const practitioner = activePractitioners.find(p => p.id === item.practitionerId)
          return {
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            price: item.discountedPrice,
            total: item.discountedPrice * item.quantity,
            practitionerName: practitioner?.name,
          }
        }),
        subtotal: rawSubtotal,
        itemDiscount: itemDiscountsTotal,
        transDiscount: transDiscountReduction,
        tax: taxAmount,
        total: totalAmount,
        paymentMethod: paymentLabel[paymentMethod] || paymentMethod,
        received: paymentMethod === 'cash' ? numCashReceived : totalAmount,
        change: paymentMethod === 'cash' ? cashChange : 0,
        saleId,
        sale: (completedSale || receiptSale) as Sale,
      }

      setReceipt(receiptData)

      notify({
        title: 'Transaksi kasir selesai',
        message: `Pembayaran ${customerName} sebesar ${rupiah(totalAmount)} (${paymentLabel[paymentMethod]}) berhasil diproses.`,
        category: 'transaction',
      })

      clearCart()
      router.refresh()
    } catch (err) {
      setCheckoutError((err as Error).message || 'Terjadi kesalahan saat memproses transaksi.')
    } finally {
      setCheckoutPending(false)
    }
  }

  // ===============================
  // Appointments Table Request hook
  // ===============================
  function useVisitRequest(done: (visit: SalonVisit) => void) {
    const [pending, setPending] = useState(false)
    const [error, setError] = useState('')
    const [locked, setLocked] = useState(false)
    const packet = useRef<any>(null)
    const busy = useRef(false)

    async function run(next: any) {
      if (busy.current) return
      const sent = packet.current || next
      busy.current = true
      setPending(true)
      setError('')
      try {
        const r = await salonVisitOperation(sent.input, sent.details)
        if (r.value) {
          packet.current = null
          done(r.value)
        } else {
          setError(r.error || 'Belum tersimpan.')
          packet.current = r.uncertain ? sent : null
          setLocked(Boolean(r.uncertain))
        }
      } catch {
        packet.current = sent
        setLocked(true)
        setError('Hasil belum pasti. Ulangi permintaan yang sama atau muat ulang untuk memeriksa.')
      } finally {
        busy.current = false
        setPending(false)
      }
    }
    return { pending, error, locked, run }
  }

  const visitRequest = useVisitRequest(() => {
    if (operation) {
      const actionMessages: Record<string, string> = {
        arrive: `${operation.visit.customer} telah ditandai tiba di salon.`,
        start: `Pelayanan untuk ${operation.visit.customer} bersama ${operation.visit.practitioner_name} telah dimulai.`,
        finish: operation.visit.sale_id
          ? `Pelayanan untuk ${operation.visit.customer} telah selesai. Pembayaran sudah lunas.`
          : `Pelayanan untuk ${operation.visit.customer} telah selesai dan siap dibayar.`,
      }
      const actionTitles: Record<string, string> = {
        arrive: 'Pelanggan tiba',
        start: 'Pelayanan dimulai',
        finish: 'Pelayanan selesai',
      }
      if (actionMessages[operation.action]) {
        notify({
          title: actionTitles[operation.action],
          message: actionMessages[operation.action],
          category: 'appointment',
        })
      }
    }
    setOperation(null)
    setNotice('Perubahan kunjungan tersimpan.')
    router.refresh()
  })

  function navigateDay(nextDay: string, page = 0) {
    startTransition(() =>
      router.replace(
        '/dashboard/salon/appointments?' +
        new URLSearchParams({ day: nextDay, page: String(page) })
      )
    )
  }

  function transitionVisit(visit: SalonVisit, action: string) {
    setOperation({ visit, action })
    void visitRequest.run({
      input: {
        id: visit.id,
        revision: visit.revision,
        request: crypto.randomUUID(),
        action,
      },
      details: {},
    })
  }

  // Filter catalog items
  const filteredServices = foundation.services.filter(s => {
    if (!s.active) return false
    if (catalogFilter === 'products') return false
    return s.name.toLocaleLowerCase('id-ID').includes(catalogQuery.trim().toLocaleLowerCase('id-ID'))
  })

  const filteredProducts = products.filter(p => {
    if (!p.active) return false
    if (catalogFilter === 'services') return false
    const matchQuery =
      p.name.toLocaleLowerCase('id-ID').includes(catalogQuery.trim().toLocaleLowerCase('id-ID')) ||
      p.category.toLocaleLowerCase('id-ID').includes(catalogQuery.trim().toLocaleLowerCase('id-ID'))
    return matchQuery
  })

  // Filter visits list
  const filteredVisits = visits.items.filter(v => {
    if (visitStatusFilter === 'all') return true
    return v.status === visitStatusFilter
  })

  return (
    <DashboardSection title="Janji temu & kasir" businessName={business.name}>
      {/* ======================================================== */}
      {/* 1. TOP WORKBENCH: CATALOG (LEFT) & ACTIVE CART (RIGHT)   */}
      {/* ======================================================== */}
      <section
        id="salon-workbench"
        className="mb-6 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]"
      >
        {/* LEFT COLUMN: UNIFIED SERVICES & PRODUCTS CATALOG */}
        <section className={panel} aria-label="Katalog Layanan & Produk Kasir">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#454d5b]/60 pb-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Katalog Kasir Salon</h2>
              <p className="mt-0.5 text-xs text-[#c5cbd5]">
                Klik item untuk menambahkan langsung ke keranjang kasir
              </p>
            </div>
            {/* Filter Pills */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCatalogFilter('all')}
                className={`rounded-full px-3 py-1 text-xs font-normal transition cursor-pointer border-0 ${catalogFilter === 'all'
                    ? 'bg-[#1835d9] text-white shadow-xs'
                    : 'bg-[#303640] text-[#c5cbd5] hover:bg-[#3d4653]'
                  }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setCatalogFilter('services')}
                className={`rounded-full px-3 py-1 text-xs font-normal transition cursor-pointer border-0 ${catalogFilter === 'services'
                    ? 'bg-[#1835d9] text-white shadow-xs'
                    : 'bg-[#303640] text-[#c5cbd5] hover:bg-[#3d4653]'
                  }`}
              >
                Layanan ({foundation.services.filter(s => s.active).length})
              </button>
              <button
                type="button"
                onClick={() => setCatalogFilter('products')}
                className={`rounded-full px-3 py-1 text-xs font-normal transition cursor-pointer border-0 ${catalogFilter === 'products'
                    ? 'bg-[#1835d9] text-white shadow-xs'
                    : 'bg-[#303640] text-[#c5cbd5] hover:bg-[#3d4653]'
                  }`}
              >
                Produk ({products.filter(p => p.active).length})
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mt-3.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#a4a7ac]" />
              <input
                type="text"
                placeholder="Cari layanan potong rambut, hair spa, pomade, dsb..."
                value={catalogQuery}
                onChange={e => setCatalogQuery(e.target.value)}
                className={input + ' pl-9 text-xs sm:text-sm'}
              />
            </div>
          </div>

          {/* Cards Grid */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4 max-h-[580px] overflow-y-auto pr-1">
            {/* Services Cards */}
            {filteredServices.map(s => {
              const discount = serviceDiscounts[s.id]
              const photo = servicePhotos[s.id]
              const discountedPrice = discount ? discount.discountedPrice : Number(s.price)

              return (
                <article
                  key={'service-' + s.id}
                  onClick={() => setDetailModal({ kind: 'service', item: s })}
                  className="group flex flex-col justify-between overflow-hidden rounded-xl border border-[#454d5b] bg-[#1c222e] p-2 text-left transition hover:border-[#24cbc5] focus-visible:outline-2 focus-visible:outline-[#24cbc5] cursor-pointer"
                >
                  <div>
                    <div className="relative mb-2 aspect-[4/3] w-full overflow-hidden rounded-lg bg-[#273242]">
                      {photo ? (
                        <img
                          src={photo}
                          alt={s.name}
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="grid size-full place-items-center text-[#a4a7ac]">
                          <Scissors className="size-6 text-[#24cbc5]/60" />
                        </div>
                      )}
                      <span className="absolute top-1.5 left-1.5 rounded-md bg-[#1835d9]/90 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-xs">
                        {s.duration_minutes} mnt
                      </span>
                    </div>

                    <div className="px-1 pb-1">
                      <span className="line-clamp-2 break-words text-xs sm:text-sm font-medium text-white">
                        {s.name}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1 px-1 pt-1">
                    <div className="min-w-0">
                      {discount ? (
                        <div className="flex flex-col">
                          <del className="text-[10px] text-[#a4a7ac]">{rupiah(discount.basePrice)}</del>
                          <span className="text-xs sm:text-sm font-semibold text-[#24cbc5]">
                            {rupiah(discountedPrice)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs sm:text-sm font-semibold text-[#24cbc5]">
                          {rupiah(Number(s.price))}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`Tambah ${s.name} ke keranjang`}
                      onClick={e => {
                        e.stopPropagation()
                        addServiceToCart(s)
                      }}
                      className="grid size-7 sm:size-8 place-items-center rounded-lg bg-[#1835d9] text-white hover:bg-[#132c9e] active:scale-95 transition border-0 shadow-sm shrink-0 cursor-pointer"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </article>
              )
            })}

            {/* Products Cards */}
            {filteredProducts.map(p => {
              const discount = productDiscounts[p.id]
              const photo = productPhotos[p.id]
              const discountedPrice = discount ? discount.discountedPrice : p.price
              const outOfStock = p.stock <= 0

              return (
                <article
                  key={'product-' + p.id}
                  onClick={() => setDetailModal({ kind: 'product', item: p })}
                  className={`group flex flex-col justify-between overflow-hidden rounded-xl border border-[#454d5b] bg-[#1c222e] p-2 text-left transition hover:border-[#06b6d4] focus-visible:outline-2 focus-visible:outline-[#06b6d4] cursor-pointer ${outOfStock ? 'opacity-50' : ''
                    }`}
                >
                  <div>
                    <div className="relative mb-2 aspect-[4/3] w-full overflow-hidden rounded-lg bg-[#273242]">
                      {photo ? (
                        <img
                          src={photo}
                          alt={p.name}
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="grid size-full place-items-center text-[#a4a7ac]">
                          <Package className="size-6 text-[#06b6d4]/60" />
                        </div>
                      )}
                      <span
                        className={`absolute top-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium shadow-xs ${outOfStock
                            ? 'bg-red-500/90 text-white'
                            : 'bg-[#273242]/90 text-[#a4a7ac]'
                          }`}
                      >
                        {outOfStock ? 'Habis' : `Stok: ${p.stock} ${p.unit}`}
                      </span>
                    </div>

                    <div className="px-1 pb-1">
                      <span className="line-clamp-2 break-words text-xs sm:text-sm font-medium text-white">
                        {p.name}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1 px-1 pt-1">
                    <div className="min-w-0">
                      {discount ? (
                        <div className="flex flex-col">
                          <del className="text-[10px] text-[#a4a7ac]">{rupiah(discount.basePrice)}</del>
                          <span className="text-xs sm:text-sm font-semibold text-[#06b6d4]">
                            {rupiah(discountedPrice)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs sm:text-sm font-semibold text-[#06b6d4]">
                          {rupiah(p.price)}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={outOfStock}
                      aria-label={`Tambah ${p.name} ke keranjang`}
                      onClick={e => {
                        e.stopPropagation()
                        addProductToCart(p)
                      }}
                      className="grid size-7 sm:size-8 place-items-center rounded-lg bg-[#1835d9] text-white hover:bg-[#132c9e] active:scale-95 transition border-0 shadow-sm shrink-0 cursor-pointer disabled:opacity-40"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          {!filteredServices.length && !filteredProducts.length && (
            <div className="py-12 text-center text-[#a4a7ac]">
              <p className="text-sm">Tidak ada layanan atau produk yang cocok.</p>
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: ACTIVE CART & CHECKOUT */}
        <section className={panel} aria-label="Keranjang Kasir Salon">
          <div className="flex items-center justify-between border-b border-[#454d5b]/60 pb-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="size-5 text-[#24cbc5]" />
              <h2 className="text-lg font-semibold text-white">Keranjang Aktif</h2>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-xs text-[#a4a7ac] hover:text-red-400 transition cursor-pointer border-0 bg-transparent"
              >
                Kosongkan
              </button>
            )}
          </div>

          {/* Customer Selection */}
          <div className="mt-3.5 space-y-2">
            <label className="text-xs font-medium text-[#c5cbd5]">Pelanggan / Member</label>
            <PosCustomerPicker
              member={member}
              value={selectedCustomer}
              onChange={c => {
                setSelectedCustomer(c)
                if (c) {
                  setCustomCustomerName(c.name)
                  setCustomerPhone(c.phone || '')
                } else {
                  setCustomCustomerName('Pelanggan Umum')
                  setCustomerPhone('')
                  setSelectedRedemption(null)
                }
              }}
            />
          </div>

          {/* Penukaran Poin Member (Hanya untuk member / pelanggan terdaftar) */}
          {selectedCustomer && (
            <div className="mt-3.5 rounded-xl border border-[#24cbc5]/40 bg-[#1c222e] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-[#24cbc5]" />
                  <span className="text-xs font-semibold text-white">Penukaran Poin Member</span>
                </div>
                <span className="rounded-full bg-[#24cbc5]/20 px-2.5 py-0.5 text-xs font-bold text-[#24cbc5]">
                  {Number(selectedCustomer.points || 0).toLocaleString('id-ID')} Poin
                </span>
              </div>

              {availableRedemptions.length === 0 ? (
                <p className="text-[11px] text-[#a4a7ac]">
                  Belum ada pengaturan pertukaran poin. Atur di menu Pengaturan Usaha.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-[11px] text-[#c5cbd5]">Pilih Hadiah / Penukaran:</label>
                  <select
                    value={selectedRedemption?.id || ''}
                    onChange={e => {
                      const rule = availableRedemptions.find(r => r.id === e.target.value)
                      if (!rule) {
                        setSelectedRedemption(null)
                        return
                      }
                      if ((selectedCustomer.points || 0) < rule.points_required) {
                        setSelectedRedemption(null)
                        return
                      }
                      setSelectedRedemption(rule)
                    }}
                    className="w-full rounded-lg border border-[#454d5b] bg-[#273242] px-3 py-2 text-xs text-white outline-none focus:border-[#24cbc5]"
                  >
                    <option value="">-- Tanpa Penukaran Poin --</option>
                    {availableRedemptions.map(rule => {
                      const hasEnough = (selectedCustomer.points || 0) >= rule.points_required
                      const label = rule.reward_type === 'voucher'
                        ? `Tukar ${rule.points_required} Poin → Voucher Rp${(rule.voucher_amount || 0).toLocaleString('id-ID')}`
                        : rule.reward_type === 'product'
                          ? `Tukar ${rule.points_required} Poin → Gratis Produk ${rule.product_name}`
                          : `Tukar ${rule.points_required} Poin → Gratis Layanan ${rule.service_name}`
                      return (
                        <option key={rule.id} value={rule.id} disabled={!hasEnough}>
                          {label} {!hasEnough ? '(Poin Kurang)' : '✓'}
                        </option>
                      )
                    })}
                  </select>
                  {selectedRedemption && (
                    <div className="flex items-center justify-between rounded-lg bg-[#1835d9]/30 px-3 py-2 text-xs text-white">
                      <span>Gunakan: <b>{selectedRedemption.points_required} Poin</b></span>
                      <span className="font-semibold text-[#24cbc5]">
                        {selectedRedemption.reward_type === 'voucher'
                          ? `-Rp${(selectedRedemption.voucher_amount || 0).toLocaleString('id-ID')}`
                          : 'Item Gratis'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Transaction Mode: Walk-in vs Scheduled */}
          <div className="mt-3.5">
            <label className="mb-1.5 block text-xs font-medium text-[#c5cbd5]">
              Jenis Transaksi
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTxMode('walk_in')}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition cursor-pointer border-0 ${txMode === 'walk_in'
                    ? 'bg-[#1835d9] text-white shadow-xs'
                    : 'bg-[#1c222e] text-[#c5cbd5] hover:bg-[#1c222e]/80'
                  }`}
              >
                <Scissors className="size-3.5" />
                <span>Walk-in (Langsung)</span>
              </button>
              <button
                type="button"
                onClick={() => setTxMode('appointment')}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition cursor-pointer border-0 ${txMode === 'appointment'
                    ? 'bg-[#1835d9] text-white shadow-xs'
                    : 'bg-[#1c222e] text-[#c5cbd5] hover:bg-[#1c222e]/80'
                  }`}
              >
                <CalendarDays className="size-3.5" />
                <span>Janji Temu</span>
              </button>
            </div>

            {txMode === 'appointment' && (
              <div className="mt-2.5">
                <DatePicker
                  label="Jadwal Mulai Kunjungan (WIB)"
                  withTime
                  value={appointmentStart}
                  onChange={setAppointmentStart}
                />
              </div>
            )}
          

            {/* Opsi Pembayaran: Bayar Semua vs DP */}
            {servicesInCart.length > 0 && (
              <div className="mt-3.5 border-t border-[#454d5b]/40 pt-3">
                <label className="mb-1.5 block text-xs font-medium text-[#c5cbd5]">
                  Opsi Pembayaran Kunjungan
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCartPaymentOption('full')}
                    className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition cursor-pointer border-0 ${
                      cartPaymentOption === 'full'
                        ? 'bg-[#1835d9] text-white shadow-xs'
                        : 'bg-[#1c222e] text-[#c5cbd5] hover:bg-[#1c222e]/80'
                    }`}
                  >
                    <CheckCircle2 className="size-3.5" />
                    <span>Bayar Semua (Lunas)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCartPaymentOption('dp')
                      if (!dpAmountInput) {
                        const defaultDp = Math.round(totalAmount * 0.5) || 20000
                        setDpAmountInput(String(defaultDp))
                      }
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition cursor-pointer border-0 ${
                      cartPaymentOption === 'dp'
                        ? 'bg-[#1835d9] text-white shadow-xs'
                        : 'bg-[#1c222e] text-[#c5cbd5] hover:bg-[#1c222e]/80'
                    }`}
                  >
                    <Banknote className="size-3.5" />
                    <span>Uang Muka (DP)</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Cart Item List */}
          <div className="mt-4 border-t border-[#454d5b]/60 pt-3">
            {!cart.length ? (
              <div className="rounded-xl border border-dashed border-[#454d5b] bg-[#1c222e]/60 px-4 py-10 text-center">
                <ShoppingBag className="mx-auto size-8 text-[#454d5b] mb-2" />
                <p className="text-sm font-medium text-white">Keranjang masih kosong</p>
                <p className="mt-1 text-xs text-[#a4a7ac]">
                  Pilih layanan potong rambut atau produk perawatan dari katalog.
                </p>
              </div>
            ) : (
              <form onSubmit={handleCheckout} className="space-y-4">
                <ul className="divide-y divide-[#454d5b]/40 max-h-64 overflow-y-auto pr-1">
                  {cart.map(item => (
                    <li key={item.kind + '-' + item.id} className="py-2.5">
                      <div className="flex items-start gap-2.5">
                        {/* Thumbnail */}
                        {item.photo ? (
                          <img
                            src={item.photo}
                            alt={item.name}
                            className="size-10 rounded-lg object-cover shrink-0 border border-[#454d5b]/40 bg-[#1c222e]"
                          />
                        ) : (
                          <div className="size-10 rounded-lg bg-[#1c222e] grid place-items-center text-[#a4a7ac] shrink-0 border border-[#454d5b]/30">
                            {item.kind === 'service' ? (
                              <Scissors className="size-4.5 text-[#24cbc5]" />
                            ) : (
                              <Package className="size-4.5 text-[#06b6d4]" />
                            )}
                          </div>
                        )}

                        {/* Name & Pricing */}
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-xs sm:text-sm font-medium text-white">
                            {item.name}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            {item.discountInfo ? (
                              <>
                                <del className="text-[10px] text-[#a4a7ac]">
                                  {rupiah(item.price)}
                                </del>
                                <span className="text-xs font-semibold text-[#24cbc5]">
                                  {rupiah(item.discountedPrice)}
                                </span>
                              </>
                            ) : (
                              <span className="text-xs font-semibold text-white">
                                {rupiah(item.price)}
                              </span>
                            )}
                          </div>

                          {/* Practitioner selector for service */}
                          {item.kind === 'service' && (
                            <div className="mt-2">
                              <SelectInput
                                value={item.practitionerId || ''}
                                onChange={e => updateServicePractitioner(item.id, e.target.value)}
                                className={input + ' !py-1 !text-xs w-full'}
                              >
                                <option value="" disabled>
                                  Pilih penata/terapis...
                                </option>
                                {activePractitioners.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                    {!p.service_ids.includes(item.id) ? ' (umum)' : ''}
                                  </option>
                                ))}
                              </SelectInput>
                            </div>
                          )}

                          {/* Quantity control for product */}
                          {item.kind === 'product' && (
                            <div className="mt-2 flex items-center gap-1.5">
                              {/* Left Arrow: ChevronUp */}
                              <button
                                type="button"
                                onClick={() => updateProductQty(item.id, item.quantity + 1)}
                                disabled={item.stock != null && item.quantity >= item.stock}
                                className="grid size-7 place-items-center rounded-lg bg-[#273242] text-[#c5cbd5] hover:bg-[#3d4653] hover:text-white transition-all border border-[#454d5b] shrink-0 disabled:opacity-40 cursor-pointer"
                              >
                                <ChevronUp className="size-3.5" />
                              </button>
                              {/* Center Input */}
                              <input
                                type="number"
                                min={1}
                                max={item.stock || 9999}
                                value={item.quantity}
                                onChange={e => {
                                  const val = parseInt(e.target.value, 10)
                                  if (!isNaN(val)) updateProductQty(item.id, val)
                                }}
                                className="w-12 rounded-lg border border-[#454d5b] bg-[#1c222e] py-0.5 text-center text-xs font-medium text-white"
                              />
                              {/* Right Arrow: ChevronDown */}
                              <button
                                type="button"
                                onClick={() => updateProductQty(item.id, item.quantity - 1)}
                                disabled={item.quantity <= 1}
                                className="grid size-7 place-items-center rounded-lg bg-[#273242] text-[#c5cbd5] hover:bg-[#3d4653] hover:text-white transition-all border border-[#454d5b] shrink-0 disabled:opacity-40 cursor-pointer"
                              >
                                <ChevronDown className="size-3.5" />
                              </button>
                              <span className="text-[11px] text-[#a4a7ac] ml-1">{item.unit}</span>
                            </div>
                          )}
                        </div>

                        {/* Trash Button */}
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          title="Hapus item"
                          aria-label="Hapus item"
                          className="grid size-7 place-items-center rounded-full bg-red-500/15 text-[#ffb4ae] hover:bg-red-500/25 active:scale-95 transition cursor-pointer border-0 shrink-0"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Overall Transaction Discount */}
                <div className="rounded-xl border border-[#454d5b]/60 bg-[#1c222e] p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium text-white">
                    <span>Diskon Keseluruhan Transaksi</span>
                    <span className="text-[10px] text-[#24cbc5]">Opsional</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <SelectInput
                      className={input + ' !py-1 !text-xs'}
                      value={transDiscountKind}
                      onChange={e => {
                        setTransDiscountKind(e.target.value as any)
                        if (e.target.value === 'none') setTransDiscountValue('0')
                      }}
                    >
                      <option value="none">Tanpa diskon</option>
                      <option value="percent">Persentase (%)</option>
                      <option value="amount">Nominal (Rp)</option>
                    </SelectInput>
                    {transDiscountKind !== 'none' && (
                      <input
                        type="number"
                        min={0}
                        max={transDiscountKind === 'percent' ? 100 : afterItemDiscountSubtotal}
                        value={transDiscountValue}
                        onChange={e => setTransDiscountValue(e.target.value)}
                        placeholder="Nilai diskon"
                        className={input + ' !py-1 !text-xs'}
                      />
                    )}
                  </div>
                </div>

                {/* Cost Breakdown */}
                <div className="space-y-1.5 rounded-xl bg-[#1c222e] p-3 text-xs">
                  <div className="flex justify-between text-[#c5cbd5]">
                    <span>Subtotal</span>
                    <span>{rupiah(rawSubtotal)}</span>
                  </div>
                  {itemDiscountsTotal > 0 && (
                    <div className="flex justify-between text-[#24cbc5]">
                      <span>Diskon Item</span>
                      <span>-{rupiah(itemDiscountsTotal)}</span>
                    </div>
                  )}
                  {transDiscountReduction > 0 && (
                    <div className="flex justify-between text-[#24cbc5]">
                      <span>Diskon Transaksi</span>
                      <span>-{rupiah(transDiscountReduction)}</span>
                    </div>
                  )}
                  {pointDiscountReduction > 0 && (
                    <div className="flex justify-between text-[#24cbc5]">
                      <span>Tukar Poin ({selectedRedemption?.points_required} Poin)</span>
                      <span>-{rupiah(pointDiscountReduction)}</span>
                    </div>
                  )}
                  {activeTaxes.map(t => (
                    <div key={t.id} className="flex justify-between text-[#c5cbd5]">
                      <span>{t.name} ({t.rate}%)</span>
                      <span>+{rupiah(t.amount)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-[#454d5b]/60 pt-2 text-sm font-semibold text-white">
                    <span>Total Tagihan</span>
                    <span className="text-base text-[#24cbc5]">{rupiah(totalAmount)}</span>
                  </div>
                </div>

                {/* DP Amount Input & Balance Preview */}
                {cartPaymentOption === 'dp' && servicesInCart.length > 0 && (
                  <div className="rounded-xl border border-[#24cbc5]/30 bg-[#1c222e] p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-medium">Nominal Uang Muka (DP)</span>
                      <span className="text-[10px] text-[#24cbc5]">Bayar sebagian</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={1}
                        max={totalAmount}
                        value={dpAmountInput}
                        onChange={e => setDpAmountInput(e.target.value)}
                        placeholder="Masukkan nominal DP..."
                        className={input + ' !py-1 !text-sm flex-1'}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const half = Math.round(totalAmount / 2)
                          setDpAmountInput(String(half))
                        }}
                        className="rounded-lg bg-[#273242] px-2.5 py-1 text-xs text-[#c5cbd5] hover:text-white border border-[#454d5b] cursor-pointer"
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const quarter = Math.round(totalAmount * 0.2)
                          setDpAmountInput(String(quarter))
                        }}
                        className="rounded-lg bg-[#273242] px-2.5 py-1 text-xs text-[#c5cbd5] hover:text-white border border-[#454d5b] cursor-pointer"
                      >
                        20%
                      </button>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-[#454d5b]/40 text-xs">
                      <span className="text-[#c5cbd5]">Sisa Pelunasan Nanti:</span>
                      <span className="font-semibold text-amber-400">
                        {rupiah(Math.max(0, totalAmount - (Number(dpAmountInput) || 0)))}
                      </span>
                    </div>
                  </div>
                )}

                {/* Payment Methods */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-[#c5cbd5]">Metode Pembayaran</label>
                  <div className="grid grid-cols-2 gap-2">
                    {availablePaymentMethods.map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={`rounded-xl py-2 px-3 text-xs font-medium transition cursor-pointer border-0 ${paymentMethod === m
                            ? 'bg-[#1835d9] text-white shadow-xs'
                            : 'bg-[#1c222e] text-[#c5cbd5] hover:bg-[#1c222e]/80'
                          }`}
                      >
                        {paymentLabel[m] || m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cash Received & Change */}
                {paymentMethod === 'cash' && (
                  <div className="rounded-xl border border-[#454d5b]/60 bg-[#1c222e] p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-medium">Uang Tunai Diterima</span>
                      <button
                        type="button"
                        onClick={() => setCashReceived(String(payableTarget))}
                        className="text-[11px] text-[#24cbc5] hover:underline cursor-pointer border-0 bg-transparent"
                      >
                        Uang Pas ({rupiah(payableTarget)})
                      </button>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={cashReceived}
                      placeholder="Masukkan uang yang diterima..."
                      onChange={e => setCashReceived(e.target.value)}
                      className={input + ' !py-1 !text-sm'}
                    />
                    <div className="flex justify-between items-center pt-1 font-medium">
                      <span className="text-[#c5cbd5]">Kembalian:</span>
                      <span className="text-sm font-semibold text-white">
                        {rupiah(cashChange)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Manual Verification Checkbox */}
                <label className="flex items-center gap-2.5 rounded-lg bg-[#1c222e] p-2.5 text-xs text-[#c5cbd5] cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={paymentConfirmed}
                    onChange={e => setPaymentConfirmed(e.target.checked)}
                    className="size-4 shrink-0 accent-[#1835d9] cursor-pointer"
                  />
                  <span>{cartPaymentOption === 'dp' && servicesInCart.length > 0 ? 'Uang Muka (DP) telah diterima dan diperiksa secara manual.' : 'Pembayaran telah diterima dan diperiksa secara manual.'}</span>
                </label>

                {checkoutError && (
                  <p role="alert" className="text-xs text-[#ffb4ae]">
                    {checkoutError}
                  </p>
                )}

                {/* Checkout Button */}
                <button
                  type="submit"
                  disabled={checkoutPending || !cart.length}
                  className="w-full rounded-full bg-[#1835d9] py-3 text-sm font-semibold text-white hover:bg-[#132c9e] active:scale-98 transition shadow-md disabled:opacity-40 cursor-pointer border-0 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="size-4" />
                  <span>
                    {checkoutPending
                      ? 'Memproses Pembayaran...'
                      : `Selesaikan Transaksi · ${rupiah(totalAmount)}`}
                  </span>
                </button>
              </form>
            )}
          </div>
        </section>
      </section>

      {/* ======================================================== */}
      {/* 2. RECEIPT MODAL ON SUCCESSFUL CHECKOUT                  */}
      {/* ======================================================== */}
      {receipt && (
        <>
          <style>{`@media print {
            body { background: white !important; color: black !important; }
            body > :not(#salon-receipt-print-root) { display: none !important; }
            #salon-receipt-print-root { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
            #salon-receipt-print-root section { border: 0 !important; box-shadow: none !important; }
          }`}</style>
          {mounted && createPortal(
            <div id="salon-receipt-print-root" className="hidden" aria-hidden="true">
              <SaleReceipt
                sale={receipt.sale || receiptSale || ({
                  id: receipt.saleId || crypto.randomUUID(),
                  business_id: business.id,
                  actor_id: '',
                  actor_name: receipt.cashier,
                  customer_id: null,
                  customer: receipt.customer,
                  lines: receipt.items.map((it, idx) => ({
                    id: String(idx),
                    product_id: '',
                    name: it.name,
                    quantity: it.quantity,
                    unit: it.unit || 'layanan',
                    price: it.price,
                    total: it.total,
                  })),
                  subtotal: receipt.subtotal,
                  discount_kind: receipt.transDiscount > 0 ? 'amount' : 'none',
                  discount_value: receipt.transDiscount,
                  discount: receipt.transDiscount,
                  total: receipt.total,
                  payment: (receipt.paymentMethod?.toLowerCase().includes('qris') ? 'qris' : receipt.paymentMethod?.toLowerCase().includes('transfer') ? 'transfer' : 'cash') as any,
                  received: receipt.received,
                  change: receipt.change,
                  tax_rate: receipt.tax > 0 ? Number(settings.tax_rate) : 0,
                  tax_amount: receipt.tax,
                  created_at: new Date().toISOString(),
                  status: 'completed',
                  receipt_number: receipt.code,
                } as unknown as Sale)}
                business={business}
              />
            </div>,
            document.body
          )}
          <RestaurantDialog
            title="Struk Transaksi Salon"
            busy={false}
            close={() => setReceipt(null)}
          >
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            <div
              id="printable-salon-receipt"
              className="rounded-xl border border-[#454d5b] bg-[#1c222e] p-5 text-xs font-mono space-y-3"
            >
              <div className="text-center border-b border-[#454d5b] pb-3 space-y-1">
                <p className="font-bold text-sm text-white">{business.name}</p>
                <p className="text-[#a4a7ac]">{business.address}</p>
                <p className="text-[10px] text-[#24cbc5]">KODE: {receipt.code}</p>
              </div>

              <div className="space-y-1 text-[#c5cbd5] border-b border-[#454d5b] pb-2">
                <div className="flex justify-between">
                  <span>Waktu:</span>
                  <span>{receipt.date}</span>
                </div>
                <div className="flex justify-between">
                  <span>Kasir:</span>
                  <span>{receipt.cashier}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pelanggan:</span>
                  <span>{receipt.customer}</span>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-2 border-b border-[#454d5b] pb-3">
                {receipt.items.map((it, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <div className="flex justify-between text-white font-medium">
                      <span>{it.name}</span>
                      <span>{rupiah(it.total)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-[#a4a7ac]">
                      <span>
                        {it.quantity} {it.unit || 'layanan'} x {rupiah(it.price)}
                      </span>
                      {it.practitionerName && <span>Penata: {it.practitionerName}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="space-y-1 text-[#c5cbd5] border-b border-[#454d5b] pb-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{rupiah(receipt.subtotal)}</span>
                </div>
                {receipt.itemDiscount > 0 && (
                  <div className="flex justify-between text-[#24cbc5]">
                    <span>Diskon Item:</span>
                    <span>-{rupiah(receipt.itemDiscount)}</span>
                  </div>
                )}
                {receipt.transDiscount > 0 && (
                  <div className="flex justify-between text-[#24cbc5]">
                    <span>Diskon Transaksi:</span>
                    <span>-{rupiah(receipt.transDiscount)}</span>
                  </div>
                )}
                {receipt.tax > 0 && (
                  <div className="flex justify-between">
                    <span>Pajak:</span>
                    <span>{rupiah(receipt.tax)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm text-white pt-1 border-t border-[#454d5b]/60">
                  <span>TOTAL:</span>
                  <span className="text-[#24cbc5]">{rupiah(receipt.total)}</span>
                </div>
              </div>

              {/* Payment Details */}
              <div className="space-y-1 text-[#c5cbd5]">
                <div className="flex justify-between">
                  <span>Metode:</span>
                  <span>{receipt.paymentMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span>Diterima:</span>
                  <span>{rupiah(receipt.received)}</span>
                </div>
                <div className="flex justify-between font-semibold text-white">
                  <span>Kembalian:</span>
                  <span>{rupiah(receipt.change)}</span>
                </div>
              </div>

              <p className="text-center text-[10px] text-[#a4a7ac] pt-2 border-t border-[#454d5b]">
                Terima kasih atas kunjungan Anda!
              </p>
            </div>

            {/* Receipt Modal Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#303640] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#3d4653] transition cursor-pointer border-0"
              >
                <Printer className="size-4" />
                <span>Cetak Struk</span>
              </button>
              <div className="flex gap-2">
                {receipt.saleId && (
                  <Link
                    href={`/dashboard/transactions/${receipt.saleId}`}
                    className={button + ' !text-xs !py-2'}
                  >
                    Lihat di Transaksi
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setReceipt(null)}
                  className={primary + ' !text-xs !py-2 !px-4'}
                >
                  Transaksi Baru
                </button>
              </div>
            </div>
          </div>
        </RestaurantDialog>
      </>
    )}

      {/* ======================================================== */}
      {/* 3. PRACTITIONER CALENDAR & SCHEDULE SECTION              */}
      {/* ======================================================== */}
      <section className={panel + ' mt-6'} aria-label="Kalender Penata">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#454d5b]/60 pb-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Kalender Penata & Ketersediaan</h2>
            <p className="mt-0.5 text-xs text-[#c5cbd5]">
              Blok sibuk mencakup pelayanan dan jeda waktu persiapan ({settings.buffer_minutes} menit)
            </p>
          </div>
          <div className="w-56">
            <DatePicker
              label="Tanggal (WIB)"
              value={day}
              onChange={d => navigateDay(d)}
              disabled={changing || visitRequest.pending}
            />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <div className="grid min-w-full grid-flow-col auto-cols-[minmax(210px,1fr)] gap-3 pb-2">
            {calendarPractitioners.map(p => (
              <div key={p.id} className="min-w-0 rounded-xl border border-[#454d5b] bg-[#1c222e] p-3">
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-[#24cbc5]" />
                  <h3 className="break-words text-sm font-semibold text-white truncate">{p.name}</h3>
                </div>

                <div className="mt-3 space-y-2">
                  {busySlots
                    .filter(b => b.practitioner_id === p.id)
                    .map((slot, i) => {
                      const own = visits.items.find(
                        v => v.practitioner_id === p.id && v.starts_at === slot.starts_at
                      )
                      return (
                        <div
                          key={i}
                          className="rounded-lg border border-[#24cbc5]/40 bg-[#24cbc5]/10 p-2.5 text-xs space-y-1"
                        >
                          <p className="font-semibold text-white">
                            {time(slot.starts_at)}–{time(slot.ends_at)} WIB
                          </p>
                          {own ? (
                            <button
                              type="button"
                              className="break-words text-left text-[#24cbc5] hover:underline cursor-pointer border-0 bg-transparent"
                              onClick={() => setDialog({ kind: 'detail', visit: own })}
                            >
                              {own.customer} · {salonStatuses[own.status]}
                            </button>
                          ) : (
                            <p className="text-[#c5cbd5]">
                              Sibuk {slot.in_service ? '/ Sedang Melayani' : ''}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  {!busySlots.some(b => b.practitioner_id === p.id) && (
                    <p className="text-xs text-[#a4a7ac] py-4 text-center">
                      Belum ada jadwal sibuk
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 4. VISITS / APPOINTMENTS MANAGEMENT TABLE                */}
      {/* ======================================================== */}
      <section className={panel + ' mt-6'} aria-label="Daftar Kunjungan Salon">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#454d5b]/60 pb-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Daftar Kunjungan & Janji Temu</h2>
            <p className="mt-0.5 text-xs text-[#c5cbd5]">
              Pantau antrean, tandai kehadiran, dan proses pembayaran kunjungan
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className={button}
              onClick={() => setDialog({ kind: 'edit', visit: null, walkIn: true })}
            >
              Catat walk-in
            </button>
            <button
              type="button"
              className={primary}
              onClick={() => setDialog({ kind: 'edit', visit: null })}
            >
              Buat janji temu
            </button>
          </div>
        </div>

        {/* Status Filter Pills */}
        <div className="mt-3.5 flex flex-wrap gap-1.5 border-b border-[#454d5b]/40 pb-3">
          {[
            { key: 'all', label: 'Semua' },
            { key: 'scheduled', label: 'Dijadwalkan' },
            { key: 'waiting', label: 'Menunggu' },
            { key: 'in_service', label: 'Sedang Dilayani' },
            { key: 'finished', label: 'Selesai' },
            { key: 'cancelled', label: 'Dibatalkan' },
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setVisitStatusFilter(tab.key)}
              className={`rounded-full px-3 py-1 text-xs font-normal transition cursor-pointer border-0 ${visitStatusFilter === tab.key
                  ? 'bg-[#1835d9] text-white shadow-xs'
                  : 'bg-[#303640] text-[#c5cbd5] hover:bg-[#3d4653]'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {notice && (
          <p role="status" className="mt-3 text-sm text-[#24cbc5]">
            {notice}
          </p>
        )}
        {visitRequest.error && (
          <div role="alert" className="mt-3 text-sm text-[#ffb4ae]">
            {visitRequest.error}
            {visitRequest.locked && operation && (
              <button
                className={button + ' ml-3'}
                disabled={visitRequest.pending}
                onClick={() => transitionVisit(operation.visit, operation.action)}
              >
                Ulangi permintaan yang sama
              </button>
            )}
          </div>
        )}

        {/* Visits Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[640px]">
            <thead className="border-b border-[#454d5b] text-[#c5cbd5]">
              <tr>
                {['Pelanggan & Jadwal', 'Penata & Layanan', 'Status & Tagihan', 'Tindakan'].map(
                  h => (
                    <th key={h} className="p-3 font-normal">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredVisits.map(v => (
                <tr
                  key={v.id}
                  data-testid={'salon-visit-' + v.id}
                  className="border-b border-[#454d5b]/60"
                >
                  <td className="min-w-44 max-w-64 break-words p-3">
                    <p className="font-semibold text-white">{v.customer}</p>
                    <p className="mt-1 text-xs text-[#c5cbd5]">
                      {saleDate(v.starts_at)}
                      <br />
                      hingga {saleDate(v.ends_at)}
                      <br />
                      <span className="text-[#24cbc5]">
                        {v.kind === 'walk_in' ? 'Walk-in' : 'Janji temu'}
                      </span>{' '}
                      · {v.actor_name}
                    </p>
                  </td>

                  <td className="min-w-40 max-w-72 break-words p-3">
                    <p className="font-medium text-white">{v.practitioner_name}</p>
                    <ul className="mt-1.5 space-y-1 text-xs text-[#c5cbd5]">
                      {v.lines.map(l => (
                        <li key={l.id} className="flex items-center gap-1.5">
                          {servicePhotos[l.id] ? (
                            <img
                              src={servicePhotos[l.id]}
                              alt={l.name}
                              className="size-5 rounded object-cover shrink-0 border border-[#454d5b]/40 bg-[#1c222e]"
                            />
                          ) : (
                            <div className="size-5 rounded bg-[#1c222e] grid place-items-center text-[#a4a7ac] shrink-0 border border-[#454d5b]/30">
                              <Sparkles className="size-2.5 text-[#24cbc5]/60" />
                            </div>
                          )}
                          <span>
                            {l.name} · {l.duration} mnt
                          </span>
                        </li>
                      ))}
                    </ul>
                  </td>

                  <td className="min-w-40 p-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-normal mb-1.5 ${v.status === 'finished'
                          ? 'bg-green-500/15 text-green-400'
                          : v.status === 'in_service'
                            ? 'bg-[#24cbc5]/15 text-[#24cbc5]'
                            : v.status === 'waiting'
                              ? 'bg-amber-500/15 text-amber-400'
                              : v.status === 'cancelled' || v.status === 'no_show'
                                ? 'bg-red-500/15 text-red-400'
                                : 'bg-[#1835d9]/15 text-[#a5b4fc]'
                        }`}
                    >
                      {salonStatuses[v.status]}
                    </span>
                    <p className="text-xs text-[#c5cbd5]">
                      Subtotal: {rupiah(Number(v.subtotal))}
                      {Number(v.deposit_amount) > 0 && (
                        <>
                          <br />
                          DP: {rupiah(Number(v.deposit_amount))}
                          {v.deposit_payment ? ` (${paymentLabel[v.deposit_payment]})` : ''}
                        </>
                      )}
                      {v.sale_id ? (
                        <>
                          <br />
                          <span className="text-green-400">Lunas</span>
                        </>
                      ) : v.status === 'finished' ? (
                        <>
                          <br />
                          <span className="text-amber-400">Siap dibayar</span>
                        </>
                      ) : null}
                    </p>
                  </td>

                  <td className="min-w-56 p-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className={button + ' !text-xs !py-1 !px-2.5'}
                        onClick={() => setDialog({ kind: 'detail', visit: v })}
                      >
                        Detail
                      </button>

                      {!['cancelled', 'no_show'].includes(v.status) && (
                        <>
                          {!v.sale_id && ['scheduled', 'waiting'].includes(v.status) && (
                            <button
                              type="button"
                              className={button + ' !text-xs !py-1 !px-2.5'}
                              onClick={() => setDialog({ kind: 'edit', visit: v })}
                            >
                              Ubah
                            </button>
                          )}
                          {v.status === 'scheduled' && (
                            <button
                              type="button"
                              disabled={visitRequest.pending || visitRequest.locked}
                              className={button + ' !text-xs !py-1 !px-2.5'}
                              onClick={() => transitionVisit(v, 'arrive')}
                            >
                              Tandai datang
                            </button>
                          )}
                          {v.status === 'waiting' && (
                            <button
                              type="button"
                              disabled={visitRequest.pending || visitRequest.locked}
                              className={primary + ' !text-xs !py-1 !px-2.5'}
                              onClick={() => transitionVisit(v, 'start')}
                            >
                              Mulai pelayanan
                            </button>
                          )}
                          {v.status === 'in_service' && (
                            <button
                              type="button"
                              disabled={visitRequest.pending || visitRequest.locked}
                              className={primary + ' !text-xs !py-1 !px-2.5'}
                              onClick={() => transitionVisit(v, 'finish')}
                            >
                              Selesaikan pelayanan
                            </button>
                          )}
                          {!v.sale_id && v.status === 'finished' && (
                            <button
                              type="button"
                              className={primary + ' !text-xs !py-1 !px-3'}
                              onClick={() => setDialog({ kind: 'pay', visit: v })}
                            >
                              Bayar
                            </button>
                          )}
                          {!v.sale_id && Number(v.deposit_amount) === 0 && (
                            <button
                              type="button"
                              className={button + ' !text-xs !py-1 !px-2.5'}
                              onClick={() => setDialog({ kind: 'deposit', visit: v })}
                            >
                              Catat DP
                            </button>
                          )}
                          {!v.sale_id && <button
                            type="button"
                            className={button + ' !text-xs !py-1 !px-2.5 text-red-400 hover:text-red-300'}
                            onClick={() => setDialog({ kind: 'cancel', visit: v })}
                          >
                            Batalkan
                          </button>}
                        </>
                      )}

                      {v.sale_id && (
                        <Link
                          className={button + ' !text-xs !py-1 !px-2.5'}
                          href={'/dashboard/transactions/' + v.sale_id}
                        >
                          Detail & struk
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!filteredVisits.length && (
            <p className="py-8 text-center text-sm text-[#c5cbd5]">
              Belum ada kunjungan yang sesuai dengan filter pada tanggal ini.
            </p>
          )}
        </div>

        {/* Pagination */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#c5cbd5]">
          <span>{visits.total} kunjungan tercatat</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={visits.page === 0 || changing}
              className={button}
              onClick={() => navigateDay(day, visits.page - 1)}
            >
              Sebelumnya
            </button>
            <button
              type="button"
              disabled={(visits.page + 1) * visits.pageSize >= visits.total || changing}
              className={button}
              onClick={() => navigateDay(day, visits.page + 1)}
            >
              Berikutnya
            </button>
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 5. EXISTING BOOKING / VISIT ACTION DIALOGS               */}
      {/* ======================================================== */}
      {/* ======================================================== */}
      {/* 5. ITEM DETAIL MODAL & EXISTING BOOKING DIALOGS          */}
      {/* ======================================================== */}
      {detailModal && (
        <RestaurantDialog
          title={detailModal.kind === 'service' ? 'Detail Layanan' : 'Detail Produk'}
          busy={false}
          close={() => setDetailModal(null)}
        >
          {detailModal.kind === 'service' ? (
            <div className="space-y-4">
              <div className="aspect-[16/9] w-full overflow-hidden rounded-xl bg-[#1c222e] border border-[#454d5b]/60 flex items-center justify-center">
                {servicePhotos[detailModal.item.id] ? (
                  <img src={servicePhotos[detailModal.item.id]} alt={detailModal.item.name} className="size-full object-cover" />
                ) : (
                  <Scissors className="size-12 text-[#24cbc5]/60" />
                )}
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#24cbc5] uppercase tracking-wider">Layanan Barbershop</span>
                  <span className="rounded-full bg-[#1835d9]/20 px-2.5 py-0.5 text-xs font-medium text-[#93c5fd]">
                    Durasi: {detailModal.item.duration_minutes} menit
                  </span>
                </div>
                <h3 className="mt-1 text-lg font-bold text-white">{detailModal.item.name}</h3>
                <div className="mt-2 flex items-baseline gap-2">
                  {serviceDiscounts[detailModal.item.id] ? (
                    <>
                      <span className="text-lg font-bold text-[#24cbc5]">
                        {rupiah(serviceDiscounts[detailModal.item.id]!.discountedPrice)}
                      </span>
                      <del className="text-xs text-[#a4a7ac]">
                        {rupiah(serviceDiscounts[detailModal.item.id]!.basePrice)}
                      </del>
                    </>
                  ) : (
                    <span className="text-lg font-bold text-[#24cbc5]">{rupiah(Number(detailModal.item.price))}</span>
                  )}
                </div>
              </div>
              {getServiceBenefits(detailModal.item.id).length > 0 && (
                <div className="rounded-xl border border-[#454d5b]/60 bg-[#1c222e] p-3 space-y-2">
                  <p className="text-xs font-semibold text-[#c5cbd5]">Fasilitas / Benefit Layanan:</p>
                  <ul className="space-y-1">
                    {getServiceBenefits(detailModal.item.id).map((b, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-[#a4a7ac]">
                        <span className="text-[#24cbc5]">✓</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-2 pt-2 border-t border-[#454d5b]/60">
                <button
                  type="button"
                  onClick={() => setDetailModal(null)}
                  className={button + ' flex-1 !py-2.5'}
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    addServiceToCart(detailModal.item)
                    setDetailModal(null)
                  }}
                  className={primary + ' flex-1 flex items-center justify-center gap-1.5 border-0 !py-2.5'}
                >
                  <Plus className="size-4" />
                  <span>Tambah ke Keranjang</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="aspect-[16/9] w-full overflow-hidden rounded-xl bg-[#1c222e] border border-[#454d5b]/60 flex items-center justify-center">
                {productPhotos[detailModal.item.id] ? (
                  <img src={productPhotos[detailModal.item.id]} alt={detailModal.item.name} className="size-full object-cover" />
                ) : (
                  <Package className="size-12 text-[#24cbc5]/60" />
                )}
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#24cbc5] uppercase tracking-wider">{detailModal.item.category || 'Produk'}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${detailModal.item.stock > 0 ? 'bg-[#24cbc5]/15 text-[#24cbc5]' : 'bg-red-500/20 text-[#ffb4ae]'}`}>
                    {detailModal.item.stock > 0 ? `Stok: ${detailModal.item.stock} ${detailModal.item.unit}` : 'Habis'}
                  </span>
                </div>
                <h3 className="mt-1 text-lg font-bold text-white">{detailModal.item.name}</h3>
                <p className="mt-0.5 text-xs text-[#a4a7ac]">SKU: {detailModal.item.sku || '—'}</p>
                <div className="mt-2 flex items-baseline gap-2">
                  {productDiscounts[detailModal.item.id] ? (
                    <>
                      <span className="text-lg font-bold text-[#06b6d4]">
                        {rupiah(productDiscounts[detailModal.item.id]!.discountedPrice)}
                      </span>
                      <del className="text-xs text-[#a4a7ac]">
                        {rupiah(productDiscounts[detailModal.item.id]!.basePrice)}
                      </del>
                    </>
                  ) : (
                    <span className="text-lg font-bold text-[#06b6d4]">{rupiah(detailModal.item.price)}</span>
                  )}
                  <span className="text-xs text-[#a4a7ac]">/ {detailModal.item.unit}</span>
                </div>
              </div>
              {getProductDescription(detailModal.item.id) && (
                <div className="rounded-xl border border-[#454d5b]/60 bg-[#1c222e] p-3">
                  <p className="text-xs font-semibold text-[#c5cbd5] mb-1">Deskripsi Produk:</p>
                  <p className="text-xs text-[#a4a7ac] leading-relaxed">{getProductDescription(detailModal.item.id)}</p>
                </div>
              )}
              <div className="flex gap-2 pt-2 border-t border-[#454d5b]/60">
                <button
                  type="button"
                  onClick={() => setDetailModal(null)}
                  className={button + ' flex-1 !py-2.5'}
                >
                  Tutup
                </button>
                <button
                  type="button"
                  disabled={detailModal.item.stock <= 0}
                  onClick={() => {
                    addProductToCart(detailModal.item)
                    setDetailModal(null)
                  }}
                  className={primary + ' flex-1 flex items-center justify-center gap-1.5 border-0 !py-2.5 disabled:opacity-40'}
                >
                  <Plus className="size-4" />
                  <span>Tambah ke Keranjang</span>
                </button>
              </div>
            </div>
          )}
        </RestaurantDialog>
      )}

      {dialog?.kind === 'edit' && (
        <BookingDialog
          key={dialog.visit?.id || 'new'}
          initial={dialog.visit}
          walkIn={dialog.walkIn}
          foundation={foundation}
          servicePhotos={servicePhotos}
          settings={settings}
          payments={payments}
          close={() => setDialog(null)}
          done={v => {
            setDialog(null)
            setNotice('Kunjungan tersimpan.')
            navigateDay(
              v.starts_at ? reservationLocalTime(v.starts_at).slice(0, 10) : day
            )
          }}
        />
      )}

      {dialog?.visit && dialog.kind === 'detail' && (
        <RestaurantDialog
          title="Detail Kunjungan Salon"
          busy={false}
          close={() => setDialog(null)}
        >
          <div className="space-y-3 break-words text-sm">
            <p className="font-semibold text-white">
              {dialog.visit.customer} · {dialog.visit.phone || 'Tanpa nomor kontak'}
            </p>
            <p className="text-xs text-[#c5cbd5]">
              {saleDate(dialog.visit.starts_at)} – {saleDate(dialog.visit.ends_at)}
            </p>
            <p>
              Penata: <strong className="text-white">{dialog.visit.practitioner_name}</strong> ·{' '}
              <span className="text-[#24cbc5]">{salonStatuses[dialog.visit.status]}</span>
            </p>
            <p className="text-[#a4a7ac]">Catatan: {dialog.visit.notes || 'Tidak ada catatan'}</p>
            {dialog.visit.cancellation_reason && (
              <p className="text-red-400">Alasan: {dialog.visit.cancellation_reason}</p>
            )}
            <div className="rounded-lg bg-[#1c222e] p-3 text-xs space-y-1">
              <p>Subtotal: {rupiah(Number(dialog.visit.subtotal))}</p>
              <p>DP Terkonfirmasi: {rupiah(Number(dialog.visit.deposit_amount))}</p>
            </div>
          </div>
        </RestaurantDialog>
      )}

      {dialog?.visit && ['deposit', 'pay', 'cancel'].includes(dialog.kind) && (
        <VisitActionDialog
          key={dialog.kind + dialog.visit.id}
          kind={dialog.kind as 'deposit' | 'pay' | 'cancel'}
          visit={dialog.visit}
          manage={manage}
          settings={settings}
          payments={payments}
          close={() => setDialog(null)}
          done={v => {
            setDialog(null)
            if (v.sale_id) {
              router.push('/dashboard/transactions/' + v.sale_id)
            } else {
              setNotice('Perubahan kunjungan tersimpan.')
              router.refresh()
            }
          }}
        />
      )}
    </DashboardSection>
  )
}

function BookingDialog({
  initial,
  walkIn,
  foundation,
  servicePhotos,
  settings,
  payments,
  close,
  done,
}: {
  initial: SalonVisit | null
  walkIn?: boolean
  foundation: SalonFoundation
  servicePhotos: Record<string, string>
  settings: SalonSettings
  payments: PaymentSettings
  close: () => void
  done: (v: SalonVisit) => void
}) {
  const [id] = useState(initial?.id || crypto.randomUUID())
  const [customer, setCustomer] = useState(initial?.customer || '')
  const [phone, setPhone] = useState(initial?.phone || '')
  const [notes, setNotes] = useState(initial?.notes || '')
  const [kind, setKind] = useState(initial?.kind || (walkIn ? 'walk_in' : 'appointment'))
  const [start, setStart] = useState(
    initial ? reservationLocalTime(initial.starts_at) : reservationLocalTime(new Date().toISOString())
  )
  const [selected, setSelected] = useState<string[]>(initial?.lines.map(l => l.id) || [])
  const [practitioner, setPractitioner] = useState(initial?.practitioner_id || '')
  const [customerId, setCustomerId] = useState<string | null>(initial?.customer_id || null)
  const [serviceQuery, setServiceQuery] = useState('')
  const [deposit, setDeposit] = useState('')
  const [method, setMethod] = useState(enabledPaymentMethods(payments)[0] || 'cash')
  const [confirmed, setConfirmed] = useState(false)
  const [localError, setLocalError] = useState('')

  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [locked, setLocked] = useState(false)
  const packetRef = useRef<any>(null)
  const busy = useRef(false)

  async function runRequest(packet: any) {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    try {
      const r = await salonVisitOperation(packet.input, packet.details)
      if (r.value) {
        packetRef.current = null
        notify({
          title: initial
            ? 'Kunjungan salon diperbarui'
            : walkIn
              ? 'Walk-in dicatat'
              : 'Janji temu baru dibuat',
          message: `Kunjungan untuk "${customer}" berhasil disimpan.`,
          category: 'appointment',
        })
        done(r.value)
      } else {
        setError(r.error || 'Belum tersimpan.')
        packetRef.current = r.uncertain ? packet : null
        setLocked(Boolean(r.uncertain))
      }
    } catch {
      packetRef.current = packet
      setLocked(true)
      setError('Hasil belum pasti. Ulangi permintaan yang sama atau muat ulang untuk memeriksa.')
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  const services = foundation.services.filter(
    s => s.active || Boolean(initial?.lines.some(l => l.id === s.id))
  )
  const lines = services.filter(s => selected.includes(s.id))
  const duration = lines.reduce((n, s) => n + s.duration_minutes, 0)
  const subtotal = lines.reduce((n, s) => n + Number(s.price), 0)
  const compatible = (p: SalonFoundation['practitioners'][number]) =>
    p.active && Boolean(p.schedule) && selected.every(s => p.service_ids.includes(s))

  return (
    <RestaurantDialog
      title={initial ? 'Ubah kunjungan salon' : walkIn ? 'Catat walk-in' : 'Buat janji temu'}
      busy={pending}
      close={close}
      wide
    >
      <form
        className="space-y-4 max-h-[75vh] overflow-y-auto pr-1"
        onSubmit={e => {
          e.preventDefault()
          setLocalError('')
          try {
            const startsAt = reservationIso(start)
            void runRequest({
              input: {
                id,
                revision: initial?.revision ?? null,
                request: crypto.randomUUID(),
                action: 'save',
              },
              details: {
                practitionerId: practitioner,
                customerId,
                customer,
                phone,
                notes,
                kind,
                startsAt,
                serviceIds: selected,
                deposit:
                  !initial && deposit
                    ? {
                      amount: deposit,
                      payment: method,
                      confirmed,
                      paymentRevision: payments.revision,
                    }
                    : null,
              },
            })
          } catch (err) {
            setLocalError((err as Error).message)
          }
        }}
      >
        <fieldset disabled={pending || locked} className="space-y-4">
          <p className="text-sm text-[#c5cbd5]">
            Pilih layanan dan penata yang menangani. Pelunasan dilakukan setelah pelayanan selesai di kasir.
          </p>
          <div>
            <p className="mb-2 text-sm text-[#c5cbd5]">Cari pelanggan tersimpan</p>
            <CustomerSearch
              label="Cari pelanggan tersimpan"
              showPoints={false}
              onSelect={c => {
                setCustomerId(c.id)
                setCustomer(c.name)
                setPhone(c.phone)
              }}
            />
          </div>
          {customerId && (
            <p className="text-xs text-[#24cbc5]">
              Pelanggan tersimpan dipilih.{' '}
              <button
                type="button"
                onClick={() => setCustomerId(null)}
                className="underline cursor-pointer border-0 bg-transparent text-[#24cbc5]"
              >
                Lepaskan pilihan
              </button>
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <RestaurantField label="Nama pelanggan">
              <input
                required
                maxLength={100}
                readOnly={Boolean(customerId)}
                value={customer}
                onChange={e => setCustomer(e.target.value)}
                className={input}
              />
            </RestaurantField>
            <RestaurantField label="Nomor kontak (opsional)">
              <input
                maxLength={40}
                readOnly={Boolean(customerId)}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className={input}
              />
            </RestaurantField>
          </div>

          <RestaurantField label="Cari layanan">
            <input
              maxLength={100}
              value={serviceQuery}
              onChange={e => setServiceQuery(e.target.value)}
              className={input}
              placeholder="Cari nama layanan..."
            />
          </RestaurantField>

          <fieldset className="space-y-2">
            <legend className="text-sm text-[#c5cbd5]">Pilih Layanan (maksimal 20)</legend>
            <div className="grid gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto">
              {[
                ...services.filter(s => selected.includes(s.id)),
                ...services.filter(
                  s =>
                    !selected.includes(s.id) &&
                    s.name.toLocaleLowerCase('id-ID').includes(serviceQuery.trim().toLocaleLowerCase('id-ID'))
                ),
              ]
                .slice(0, 100)
                .map(s => (
                  <label
                    key={s.id}
                    className="flex min-h-11 items-center gap-3 rounded-lg bg-[#1c222e] p-2 text-xs transition hover:bg-[#1c222e]/80 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(s.id)}
                      disabled={!selected.includes(s.id) && (!s.active || selected.length >= 20)}
                      onChange={e =>
                        setSelected(ids =>
                          e.target.checked ? [...ids, s.id] : ids.filter(id => id !== s.id)
                        )
                      }
                      className="size-4 shrink-0 accent-[#1835d9]"
                    />
                    {servicePhotos[s.id] ? (
                      <img
                        src={servicePhotos[s.id]}
                        alt={s.name}
                        className="size-8 rounded-lg object-cover shrink-0 border border-[#454d5b]/40 bg-[#1c222e]"
                      />
                    ) : (
                      <div className="size-8 rounded-lg bg-[#1c222e] grid place-items-center text-[#a4a7ac] shrink-0 border border-[#454d5b]/30">
                        <Sparkles className="size-3.5 text-[#24cbc5]/60" />
                      </div>
                    )}
                    <span className="break-words text-white">
                      {s.name}
                      {!s.active ? ' (nonaktif)' : ''} · {s.duration_minutes} mnt · {rupiah(Number(s.price))}
                    </span>
                  </label>
                ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <RestaurantField label="Penata / terapis">
              <SelectInput
                required
                value={practitioner}
                onChange={e => setPractitioner(e.target.value)}
                className={input}
              >
                <option value="" disabled>
                  Pilih penata
                </option>
                {foundation.practitioners
                  .filter(p => p.active || p.id === initial?.practitioner_id)
                  .map(p => (
                    <option key={p.id} value={p.id} disabled={!compatible(p)}>
                      {p.name}
                      {!p.active
                        ? ' / nonaktif'
                        : !p.schedule
                          ? ' / jadwal belum diatur'
                          : !compatible(p)
                            ? ' / tidak menangani pilihan'
                            : ''}
                    </option>
                  ))}
              </SelectInput>
            </RestaurantField>
            <RestaurantField label="Jenis kunjungan">
              <SelectInput
                disabled={Boolean(initial)}
                value={kind}
                onChange={e => {
                  setKind(e.target.value as typeof kind)
                  if (!initial && e.target.value === 'walk_in')
                    setStart(reservationLocalTime(new Date().toISOString()))
                }}
                className={input}
              >
                <option value="appointment">Janji temu</option>
                <option value="walk_in">Walk-in</option>
              </SelectInput>
            </RestaurantField>
          </div>

          <DatePicker label="Mulai kunjungan (WIB)" withTime value={start} onChange={setStart} />
          <p className="text-sm text-[#24cbc5]">
            Durasi total: {duration} menit · Subtotal: {rupiah(subtotal)} · Jeda persiapan: {settings.buffer_minutes} menit
          </p>

          <RestaurantField label="Catatan kunjungan (opsional)">
            <textarea
              maxLength={1000}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className={input}
            />
          </RestaurantField>

          {!initial && (
            <details className="rounded-xl border border-[#454d5b] p-3">
              <summary className="cursor-pointer text-sm font-medium text-white">
                DP opsional (Uang Muka)
              </summary>
              <div className="mt-3 space-y-3">
                <RestaurantField label="Nominal DP (Rp)">
                  <NumericInput
                    min={1}
                    max={subtotal}
                    value={deposit}
                    onChange={e => {
                      setDeposit(e.target.value)
                      setConfirmed(false)
                    }}
                    placeholder="Kosongkan jika tanpa DP"
                    className={input}
                  />
                </RestaurantField>
                {deposit && (
                  <>
                    <RestaurantPaymentFields
                      settings={payments}
                      method={method}
                      onChange={m => {
                        setMethod(m)
                        setConfirmed(false)
                      }}
                      label="Metode DP"
                    />
                    <label className="flex min-h-11 items-center gap-3 text-sm text-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={e => setConfirmed(e.target.checked)}
                        className="size-4 shrink-0 accent-[#1835d9]"
                      />
                      <span>DP sudah diterima dan diperiksa secara manual.</span>
                    </label>
                  </>
                )}
              </div>
            </details>
          )}
        </fieldset>

        {(localError || error) && (
          <p role="alert" className="text-sm text-[#ffb4ae]">
            {localError || error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <button type="button" className={button} disabled={pending} onClick={close}>
            Batal
          </button>
          <button
            className={primary}
            disabled={
              pending ||
              (!locked &&
                (!selected.length ||
                  selected.some(id => !services.find(s => s.id === id)?.active) ||
                  duration > 720 ||
                  !foundation.practitioners.some(p => p.id === practitioner && compatible(p)) ||
                  Boolean(deposit && !confirmed)))
            }
          >
            {pending
              ? 'Menyimpan...'
              : locked
                ? 'Ulangi permintaan yang sama'
                : 'Simpan kunjungan'}
          </button>
        </div>
      </form>
    </RestaurantDialog>
  )
}

function VisitActionDialog({
  kind,
  visit,
  manage,
  settings,
  payments,
  close,
  done,
}: {
  kind: 'deposit' | 'pay' | 'cancel'
  visit: SalonVisit
  manage: boolean
  settings: SalonSettings
  payments: PaymentSettings
  close: () => void
  done: (v: SalonVisit) => void
}) {
  const [method, setMethod] = useState(enabledPaymentMethods(payments)[0] || 'cash')
  const [amount, setAmount] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [discountKind, setDiscountKind] = useState('none')
  const [discount, setDiscount] = useState('0')
  const [reason, setReason] = useState('')
  const [noShow, setNoShow] = useState(false)
  const [selectedReasonPreset, setSelectedReasonPreset] = useState('')
  const cancellationPresets = [
    'Pelanggan meminta reschedule / ganti jadwal',
    'Pelanggan berhalangan hadir / batal datang',
    'Penata / terapis berhalangan atau jadwal bentrok',
    'Antrean terlalu lama / pelanggan membatalkan',
    'Kesalahan input layanan / data kunjungan',
    'Lainnya',
  ]

  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [locked, setLocked] = useState(false)
  const busy = useRef(false)
  const packetRef = useRef<any>(null)

  let pricing: ReturnType<typeof salonQuote> | undefined
  let quoteError = ''
  try {
    pricing = salonQuote(
      Number(visit.subtotal),
      discountKind,
      discount,
      Number(settings.tax_rate),
      Number(visit.deposit_amount)
    )
  } catch (e) {
    quoteError = (e as Error).message
  }

  async function runAction(packet: any) {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    try {
      const r = await salonVisitOperation(packet.input, packet.details)
      if (r.value) {
        packetRef.current = null
        if (kind === 'pay') {
          notify({
            title: 'Pembayaran kunjungan selesai',
            message: `Pembayaran kunjungan ${visit.customer} sebesar ${rupiah(
              pricing?.balance ?? 0
            )} berhasil dicatat.`,
            category: 'transaction',
          })
        } else if (kind === 'cancel') {
          notify({
            title: noShow ? 'Pelanggan tidak hadir' : 'Kunjungan dibatalkan',
            message: `Kunjungan ${visit.customer} telah ${noShow ? 'ditandai tidak hadir' : 'dibatalkan'
              }.`,
            category: 'appointment',
          })
        } else if (kind === 'deposit') {
          notify({
            title: 'DP kunjungan dicatat',
            message: `DP kunjungan ${visit.customer} sebesar ${rupiah(Number(amount))} berhasil dicatat.`,
            category: 'transaction',
          })
        }
        done(r.value)
      } else {
        setError(r.error || 'Belum tersimpan.')
        packetRef.current = r.uncertain ? packet : null
        setLocked(Boolean(r.uncertain))
      }
    } catch {
      packetRef.current = packet
      setLocked(true)
      setError('Hasil belum pasti. Ulangi permintaan yang sama atau muat ulang untuk memeriksa.')
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  const title =
    kind === 'deposit'
      ? 'Catat DP salon'
      : kind === 'pay'
        ? 'Pembayaran salon'
        : 'Batalkan kunjungan / tidak hadir'
  const blockedRefund = kind === 'cancel' && Number(visit.deposit_amount) > 0 && !manage

  return (
    <RestaurantDialog title={title} busy={pending} close={close}>
      <p className="mb-4 break-words text-sm text-[#c5cbd5]">
        {visit.customer} · {visit.practitioner_name}
      </p>
      <form
        onSubmit={e => {
          e.preventDefault()
          const details =
            kind === 'cancel'
              ? { reason, refundConfirmed: confirmed }
              : kind === 'deposit'
                ? { amount, payment: method, confirmed, paymentRevision: payments.revision }
                : {
                  payment: method,
                  received: method === 'cash' ? amount : String(pricing?.balance ?? 0),
                  discountKind,
                  discountValue: discount,
                  confirmed,
                  paymentRevision: payments.revision,
                  settingsRevision: settings.revision,
                }
          void runAction({
            input: {
              id: visit.id,
              revision: visit.revision,
              request: crypto.randomUUID(),
              action: kind === 'cancel' ? (noShow ? 'no_show' : 'cancel') : kind === 'deposit' ? 'deposit' : 'pay',
            },
            details,
          })
        }}
        className="space-y-4"
      >
        <fieldset disabled={pending || locked || blockedRefund} className="space-y-4">
          {kind === 'cancel' ? (
            <>
              <label className="flex min-h-11 items-center gap-3 text-sm text-white cursor-pointer rounded-xl bg-[#1c222e] p-3 border border-[#454d5b]/60">
                <input
                  type="checkbox"
                  checked={noShow}
                  onChange={e => setNoShow(e.target.checked)}
                  className="size-4 shrink-0 accent-[#1835d9]"
                />
                <span>Tandai tidak hadir (pelanggan tidak datang ke salon)</span>
              </label>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-[#c5cbd5]">
                  Pilih Alasan Pembatalan:
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {cancellationPresets.map(preset => {
                    const isSelected = selectedReasonPreset === preset
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setSelectedReasonPreset(preset)
                          if (preset !== 'Lainnya') {
                            setReason(preset)
                          } else {
                            setReason('')
                          }
                        }}
                        className={`flex items-center gap-2 rounded-xl p-2.5 text-left text-xs transition border cursor-pointer ${
                          isSelected
                            ? 'border-[#24cbc5] bg-[#24cbc5]/15 text-white font-medium'
                            : 'border-[#454d5b]/60 bg-[#1c222e] text-[#c5cbd5] hover:border-[#454d5b]'
                        }`}
                      >
                        <div
                          className={`grid size-4 shrink-0 place-items-center rounded-full border ${
                            isSelected ? 'border-[#24cbc5] bg-[#24cbc5]' : 'border-[#454d5b]'
                          }`}
                        >
                          {isSelected && <div className="size-1.5 rounded-full bg-[#1c222e]" />}
                        </div>
                        <span className="leading-snug">{preset}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {(selectedReasonPreset === 'Lainnya' || (!selectedReasonPreset && reason.length > 0) || !selectedReasonPreset) && (
                <RestaurantField label="Alasan pembatalan kunjungan">
                  <textarea
                    required
                    minLength={3}
                    maxLength={300}
                    value={reason}
                    placeholder={selectedReasonPreset === 'Lainnya' ? 'Tuliskan alasan pembatalan lainnya secara rinci...' : 'Tulis atau pilih alasan pembatalan kunjungan di atas...'}
                    onChange={e => setReason(e.target.value)}
                    className={input}
                  />
                </RestaurantField>
              )}
              {Number(visit.deposit_amount) > 0 && (
                <label className="flex min-h-11 items-center gap-3 text-sm text-white cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={confirmed}
                    onChange={e => setConfirmed(e.target.checked)}
                    className="size-4 shrink-0 accent-[#1835d9]"
                  />
                  <span>
                    Refund DP penuh {rupiah(Number(visit.deposit_amount))} sudah dilakukan manual dan diperiksa.
                  </span>
                </label>
              )}
            </>
          ) : (
            <>
              {kind === 'pay' && (
                <>
                  <ul className="space-y-2 text-sm border-b border-[#454d5b]/40 pb-2">
                    {visit.lines.map(l => (
                      <li key={l.id} className="flex justify-between gap-3 text-[#c5cbd5]">
                        <span>{l.name}</span>
                        <span className="text-white font-medium">{rupiah(Number(l.total))}</span>
                      </li>
                    ))}
                  </ul>
                  {manage && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <RestaurantField label="Jenis diskon salon">
                        <SelectInput
                          value={discountKind}
                          onChange={e => {
                            setDiscountKind(e.target.value)
                            setDiscount('0')
                            setConfirmed(false)
                          }}
                          className={input}
                        >
                          <option value="none">Tanpa diskon</option>
                          <option value="percent">Persen (%)</option>
                          <option value="amount">Nominal (Rp)</option>
                        </SelectInput>
                      </RestaurantField>
                      {discountKind !== 'none' && (
                        <RestaurantField label="Nilai diskon salon">
                          <NumericInput
                            required
                            min={0}
                            max={discountKind === 'percent' ? 100 : Number(visit.subtotal)}
                            step={discountKind === 'percent' ? '0.01' : '1'}
                            value={discount}
                            onChange={e => {
                              setDiscount(e.target.value)
                              setConfirmed(false)
                            }}
                            className={input}
                          />
                        </RestaurantField>
                      )}
                    </div>
                  )}
                  {pricing && (
                    <div className="space-y-2 rounded-xl bg-[#1c222e] p-4 text-xs sm:text-sm">
                      <p className="flex justify-between text-[#c5cbd5]">
                        <span>Subtotal:</span>
                        <span>{rupiah(Number(visit.subtotal))}</span>
                      </p>
                      <p className="flex justify-between text-[#24cbc5]">
                        <span>Diskon:</span>
                        <span>-{rupiah(pricing.discount)}</span>
                      </p>
                      <p className="flex justify-between text-[#c5cbd5]">
                        <span>Pajak ({settings.tax_rate}%):</span>
                        <span>{rupiah(pricing.tax)}</span>
                      </p>
                      <p className="flex justify-between text-[#c5cbd5]">
                        <span>DP Terkonfirmasi:</span>
                        <span>{rupiah(Number(visit.deposit_amount))}</span>
                      </p>
                      <p className="flex justify-between text-base font-semibold text-[#24cbc5] pt-1 border-t border-[#454d5b]/60">
                        <span>Sisa Tagihan:</span>
                        <span>{rupiah(pricing.balance)}</span>
                      </p>
                    </div>
                  )}
                </>
              )}

              {kind === 'deposit' && (
                <RestaurantField label="Nominal DP (Rp)">
                  <NumericInput
                    required
                    min={1}
                    max={Number(visit.subtotal)}
                    value={amount}
                    onChange={e => {
                      setAmount(e.target.value)
                      setConfirmed(false)
                    }}
                    className={input}
                  />
                </RestaurantField>
              )}

              <RestaurantPaymentFields
                settings={payments}
                method={method}
                onChange={m => {
                  setMethod(m)
                  setConfirmed(false)
                }}
              />

              {kind === 'pay' && method === 'cash' && (
                <>
                  <RestaurantField label="Uang diterima (Rp)">
                    <NumericInput
                      required
                      min={0}
                      value={amount}
                      onChange={e => {
                        setAmount(e.target.value)
                        setConfirmed(false)
                      }}
                      className={input}
                    />
                  </RestaurantField>
                  <p className="text-xs text-[#24cbc5]">
                    Kembalian: {rupiah(Math.max(0, Number(amount) - (pricing?.balance ?? 0)))}
                  </p>
                </>
              )}

              <label className="flex min-h-11 items-center gap-3 text-xs sm:text-sm text-white cursor-pointer">
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={e => setConfirmed(e.target.checked)}
                  className="size-4 shrink-0 accent-[#1835d9]"
                />
                <span>
                  {kind === 'deposit'
                    ? 'DP sudah diterima dan diperiksa secara manual.'
                    : 'Sisa pembayaran sudah diterima dan diperiksa secara manual.'}
                </span>
              </label>
            </>
          )}
        </fieldset>

        {blockedRefund && (
          <p role="alert" className="text-xs text-[#ffb4ae]">
            Minta owner/admin melakukan refund DP penuh dan pembatalan.
          </p>
        )}
        {(error || quoteError) && (
          <p role="alert" className="text-xs text-[#ffb4ae]">
            {error || quoteError}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <button type="button" disabled={pending} onClick={close} className={button}>
            Batal
          </button>
          <button
            disabled={
              pending ||
              blockedRefund ||
              (!locked &&
                ((Boolean(quoteError) && kind === 'pay') ||
                  (kind !== 'cancel' &&
                    (!confirmed || !enabledPaymentMethods(payments).includes(method)))))
            }
            className={primary}
          >
            {pending
              ? 'Menyimpan...'
              : locked
                ? 'Ulangi permintaan yang sama'
                : kind === 'cancel'
                  ? 'Simpan pembatalan'
                  : kind === 'deposit'
                    ? 'Simpan DP'
                    : 'Catat pembayaran'}
          </button>
        </div>
      </form>
    </RestaurantDialog>
  )
}
