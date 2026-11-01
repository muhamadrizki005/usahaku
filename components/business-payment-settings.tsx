'use client'
import {useState} from 'react'
import {useRouter} from 'next/navigation'
import type {PaymentSettings} from '@/lib/business-payments'
import {useBusinessPayments} from './business-payment-state'
import {Modal,PaymentsModal} from './original/setup'
export default function BusinessPaymentSettings({initial,businessId}:{initial:PaymentSettings;businessId:string}){
  const state=useBusinessPayments(initial,businessId),[open,setOpen]=useState(false),router=useRouter()
  const close=()=>{if(!state.pending)setOpen(false)}
  async function save(){if(await state.save()){setOpen(false);router.refresh()}}
  return <section className="mt-6 rounded-2xl border border-[#454d5b] bg-[#273242] p-5"><h2 className="text-lg font-normal">Metode pembayaran</h2><p className="mt-2 text-sm text-[#c5cbd5]">{state.settings.configured?['Tunai','QRIS','Transfer'].filter((_,i)=>[state.settings.cash,state.settings.qris,state.settings.transfer][i]).join(' · ')||'Belum ada metode pembayaran aktif.':'Belum diatur. Kasir memakai metode pembayaran manual bawaan.'}</p><p className="mt-2 text-xs text-[#a4a7ac]">Pengaturan berlaku untuk usaha ini di semua perangkat. Penerimaan pembayaran tetap diperiksa manual.</p><button onClick={()=>{state.open();setOpen(true)}} className="mt-4 min-h-11 rounded-lg border border-[#454d5b] px-4 text-sm text-[#24cbc5]">Atur pembayaran</button>{open&&<Modal title="Atur pembayaran" pending={state.pending} close={close}><fieldset disabled={state.pending||state.uncertain}><PaymentsModal payments={state.draft} setPayments={state.setDraft} save={save} error={state.error} cancel={close}/></fieldset></Modal>}</section>
}
