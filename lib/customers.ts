import {z} from 'zod'
export type Customer={id:string;business_id:string;name:string;phone:string;notes:string;active:boolean;revision:number;created_at:string;updated_at:string}
export type PosCustomer=Pick<Customer,'id'|'name'|'phone'>
export function matchesCustomer(customer:PosCustomer,term:string){
  const query=term.trim().toLowerCase()
  let digits=query.replace(/[^0-9]/g,'');if(digits.startsWith('0'))digits='62'+digits.slice(1)
  return !query||customer.name.toLowerCase().includes(query)||(digits.length>=3&&customer.phone.includes(digits))
}
export function normalizeCustomerPhone(value:string){
  if(value.length>40)throw Error('Nomor telepon maksimal 40 karakter.')
  let phone=value.trim().replace(/[\s().-]/g,'')
  if(!phone)return ''
  if(phone.startsWith('0'))phone='+62'+phone.slice(1)
  else if(phone.startsWith('62'))phone='+'+phone
  if(!/^\+[1-9]\d{7,14}$/.test(phone))throw Error('Gunakan nomor 08… atau kode negara +62… yang valid.')
  return phone
}
export const customerSchema=z.object({name:z.string().trim().min(1,'Nama wajib diisi.').max(100),phone:z.string().max(40),notes:z.string().trim().max(1000),active:z.boolean()}).strict()
export type CustomerResult={customer?:Customer;error?:string;uncertain?:boolean}
