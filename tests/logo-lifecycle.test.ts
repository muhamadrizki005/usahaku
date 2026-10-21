import { test } from 'node:test'
import assert from 'node:assert/strict'
import { replaceLogoSafely, type LogoLifecycleOperations } from '../lib/logo-lifecycle'

test('upload failure preserves previous logo and never activates or deletes candidate', async () => {
  let activates=0, cleanups=0
  const result=await replaceLogoSafely({reserve:async()=>({id:'candidate',path:'path'}),upload:async()=>{throw Error('upload')},activate:async()=>{activates++;return 'new'},reconcile:async()=>null,cleanup:async()=>{cleanups++;return true}})
  assert.ok(result.error);assert.equal(activates,0);assert.equal(cleanups,0)
})
test('uncertain commit is reconciled; cleanup failure cannot invalidate committed logo', async () => {
  const operations:LogoLifecycleOperations<string>={reserve:async()=>({id:'candidate',path:'path'}),upload:async()=>{},activate:async()=>{throw Error('response lost')},reconcile:async path=>path==='path'?'committed':null,cleanup:async()=>{throw Error('storage unavailable')}}
  const result=await replaceLogoSafely(operations)
  assert.equal(result.value,'committed');assert.ok(result.warning);assert.equal(result.error,undefined)
})
test('unconfirmed activation never triggers cleanup: remote transaction may still be running', async () => {
  let cleanups=0
  const result=await replaceLogoSafely({reserve:async()=>({id:'candidate',path:'path'}),upload:async()=>{},activate:async()=>{throw Error('timeout')},reconcile:async()=>null,cleanup:async()=>{cleanups++;return true}})
  assert.ok(result.error);assert.equal(cleanups,0)
})
