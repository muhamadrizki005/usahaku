import {test} from 'node:test'
import assert from 'node:assert/strict'
import {restaurantMemberQuote} from '../lib/restaurant-billing'

test('restaurant point redemption follows discounts and precedes service/tax without spending more than balance or net',()=>{
 const settings={revision:1,tax_rate:10,service_rate:5,tax_base:'net_service' as const,service_scope:'dine_in' as const,loyalty_active:true,earn_nominal:10000,redemption_active:true,point_value:1000}
 const q=restaurantMemberQuote(100000,'percent','10','dine_in',settings,'5',10)
 assert.equal(q.orderDiscount,10000);assert.equal(q.pointDiscount,5000);assert.equal(q.net,85000);assert.equal(q.service,4250);assert.equal(q.tax,8925);assert.equal(q.total,98175);assert.equal(q.pointsEarned,9)
 assert.throws(()=>restaurantMemberQuote(100000,'none','0','dine_in',settings,'11',10),/Saldo poin/)
 assert.throws(()=>restaurantMemberQuote(1000,'none','0','dine_in',settings,'2',10),/melebihi/)
 assert.throws(()=>restaurantMemberQuote(1000,'none','0','dine_in',settings,'0.5',10),/tidak valid/)
 assert.throws(()=>restaurantMemberQuote(1000,'none','0','dine_in',{...settings,redemption_active:false},'1',10),/belum aktif/)
 const full=restaurantMemberQuote(1000,'none','0','dine_in',settings,'1',10);assert.equal(full.total,0);assert.equal(full.pointsEarned,0)
})
