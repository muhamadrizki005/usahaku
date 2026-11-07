import {test} from 'node:test'
import assert from 'node:assert/strict'
import {salonQuote,salonBookingSchema,salonPaymentSchema,salonOperationFailure} from '../lib/salon-operations'
import {randomUUID} from 'node:crypto'
test('salon discounts precede tax and deposits reduce only the balance; invalid drafts do not quote',()=>{
 assert.deepEqual(salonQuote(60000,'percent','10',10,10000),{subtotal:60000,discount:6000,total:59400,tax:5400,balance:49400})
 assert.equal(salonQuote(10000,'amount','1000',11,0).total,9990)
 assert.equal(salonQuote(0,'none','0',0,0).balance,0)
 assert.equal(salonQuote(5,'none','0',10,0).tax,1)
 assert.throws(()=>salonQuote(100,'none','0',1.001,0))
 for(const run of [()=>salonQuote(10000,'percent','101',0,0),()=>salonQuote(10000,'amount','10001',0,0),()=>salonQuote(10000,'none','0',0,10001),()=>salonQuote(10000,'none','',0,0)])assert.throws(run)
 const sid=randomUUID(),d={practitionerId:randomUUID(),customerId:null,customer:'Pelanggan',phone:'',notes:'',kind:'appointment',startsAt:'2026-11-08T09:00:00+07:00',serviceIds:[sid],deposit:null}
 assert.equal(salonBookingSchema.safeParse(d).success,true)
 assert.equal(salonBookingSchema.safeParse({...d,serviceIds:[sid,sid]}).success,false)
 assert.equal(salonBookingSchema.safeParse({...d,serviceIds:[]}).success,false)
 assert.equal(salonPaymentSchema.safeParse({payment:'cash',received:'1e5',discountKind:'none',discountValue:'0',confirmed:true,paymentRevision:0,settingsRevision:0}).success,false)
 assert.equal(salonOperationFailure({code:'ETIMEDOUT'}).uncertain,true)
 assert.equal(salonOperationFailure({code:'PT409'}).uncertain,undefined)
 assert.equal(salonOperationFailure({code:'P0001',message:'SQL secret'}).error.includes('SQL'),false)
})
