import {z} from 'zod'
export const bankSchema=z.object({bank:z.string().trim().min(1).max(100),holder:z.string().trim().min(1).max(160),account:z.string().trim().min(1).max(100)}).strict()
export const paymentSettingsSchema=z.object({cash:z.boolean(),qris:z.boolean(),transfer:z.boolean(),banks:z.array(bankSchema).max(10)}).strict().refine(p=>!p.transfer||p.banks.length>0,'Tambahkan minimal satu rekening transfer.')
export type PaymentSettings={cash:boolean;qris:boolean;transfer:boolean;banks:z.infer<typeof bankSchema>[];qrisImage:string;revision:number;configured:boolean}
export const legacyPaymentSettings:PaymentSettings={cash:true,qris:true,transfer:true,banks:[],qrisImage:'',revision:0,configured:false}
export type PaymentSettingsRow={business_id:string;cash:boolean;qris:boolean;transfer:boolean;banks:z.infer<typeof bankSchema>[];qris_asset:string|null;revision:number}
export function paymentSettingsView(row:PaymentSettingsRow|null):PaymentSettings{return row?{cash:row.cash,qris:row.qris,transfer:row.transfer,banks:row.banks,qrisImage:row.qris_asset?`/api/business/${row.business_id}/payment-qr?v=${row.revision}`:'',revision:row.revision,configured:true}:{...legacyPaymentSettings}}
