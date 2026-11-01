'use client'
import {useEffect,useRef,useState} from 'react'
import {saveBusinessPayments} from '@/app/payment-settings-actions'
import type {PaymentSettings} from '@/lib/business-payments'
export type PaymentDraft={qris:boolean;cash:boolean;transfer:boolean;ewallet:boolean;banks:{bank:string;holder:string;account:string}[];wallets:{provider:string;name:string;identifier:string}[];qrisImage?:string}
const draftFor=(settings:PaymentSettings):PaymentDraft=>({cash:settings.configured?settings.cash:true,qris:settings.configured?settings.qris:false,transfer:settings.configured?settings.transfer:false,banks:settings.banks,qrisImage:settings.qrisImage,ewallet:false,wallets:[]})
export function useBusinessPayments(initial:PaymentSettings,businessId:string){
  const [settings,setSettings]=useState(initial),[draft,setDraft]=useState(()=>draftFor(initial)),[pending,setPending]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false),busy=useRef(false)
  useEffect(()=>setSettings(initial),[initial])
  function open(){setError('');setUncertain(false);setDraft(draftFor(settings));if(!settings.configured){try{const saved=JSON.parse(localStorage.getItem(`${businessId}:usahaku_payments`)||'null');if(saved){setDraft({...draftFor(settings),...saved,ewallet:false,wallets:[]});setError('Draf pembayaran dari perangkat ini belum tersimpan di server. Periksa lalu simpan untuk menerapkannya.')}}catch{}}}
  async function save(){if(busy.current||uncertain)return false;busy.current=true;setPending(true);setError('');try{const result=await saveBusinessPayments({cash:draft.cash,qris:draft.qris,transfer:draft.transfer,banks:draft.transfer?draft.banks:[]},settings.revision,draft.qrisImage||'');if(result.settings){setSettings(result.settings);setDraft(draftFor(result.settings));return true}setError(result.error||'Pembayaran belum dapat disimpan.');setUncertain(!!result.uncertain);return false}catch{setError('Status penyimpanan belum pasti. Muat ulang sebelum mencoba lagi.');setUncertain(true);return false}finally{busy.current=false;setPending(false)}}
  return{settings,payments:draftFor(settings),draft,setDraft,pending,error,uncertain,open,save}
}
