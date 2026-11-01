import {z} from 'zod'
export const bankSchema=z.object({bank:z.string().trim().min(1).max(100),holder:z.string().trim().min(1).max(160),account:z.string().trim().min(1).max(100)}).strict()
export const ewalletSchema=z.object({ewallet:z.string().trim().min(1).max(100),holder:z.string().trim().min(1).max(160),number:z.string().trim().min(1).max(100)}).strict()
export const paymentSettingsSchema=z.object({
  cash:z.boolean(),
  qris:z.boolean(),
  transfer:z.boolean(),
  banks:z.array(bankSchema).max(10),
  ewallet:z.boolean().optional().default(false),
  ewallets:z.array(ewalletSchema).max(10).optional().default([])
}).strict().refine(p=>!p.transfer||p.banks.length>0,'Tambahkan minimal satu rekening transfer.').refine(p=>!p.ewallet||(p.ewallets&&p.ewallets.length>0),'Tambahkan minimal satu akun e-wallet.')

export type PaymentSettings={
  cash:boolean;
  qris:boolean;
  transfer:boolean;
  banks:z.infer<typeof bankSchema>[];
  ewallet:boolean;
  ewallets:z.infer<typeof ewalletSchema>[];
  qrisImage:string;
  revision:number;
  configured:boolean;
}
export const legacyPaymentSettings:PaymentSettings={
  cash:true,
  qris:true,
  transfer:true,
  banks:[],
  ewallet:false,
  ewallets:[],
  qrisImage:'',
  revision:0,
  configured:false
}
export type PaymentSettingsRow={
  business_id:string;
  cash:boolean;
  qris:boolean;
  transfer:boolean;
  banks:z.infer<typeof bankSchema>[];
  ewallet?:boolean;
  ewallets?:z.infer<typeof ewalletSchema>[];
  qris_asset:string|null;
  revision:number;
}
export function paymentSettingsView(row:PaymentSettingsRow|null):PaymentSettings{
  return row?{
    cash:row.cash,
    qris:row.qris,
    transfer:row.transfer,
    banks:row.banks||[],
    ewallet:Boolean(row.ewallet),
    ewallets:row.ewallets||[],
    qrisImage:row.qris_asset?`/api/business/${row.business_id}/payment-qr?v=${row.revision}`:'',
    revision:row.revision,
    configured:true
  }:{...legacyPaymentSettings}
}
