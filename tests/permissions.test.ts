import { test } from 'node:test'
import assert from 'node:assert/strict'
import { homeForRole, rolesForPath, transactionVisibility } from '../lib/auth/permissions'
import { registerSchema } from '../lib/validation'

test('cashiers keep their own-transaction scope without receiving management privileges', () => {
  assert.equal(transactionVisibility('cashier'), 'own')
  assert.equal(transactionVisibility('admin'), 'business')
  assert.equal(transactionVisibility('owner'), 'business')
  assert.ok(rolesForPath('/dashboard/transactions').includes('cashier'))
  for (const path of ['/dashboard', '/dashboard/products', '/dashboard/inventory', '/dashboard/customers', '/dashboard/reports', '/dashboard/assistant', '/dashboard/settings/staff']) {
    assert.equal(rolesForPath(path).includes('cashier'), false)
  }
  assert.deepEqual(rolesForPath('/dashboard/settings/staff'), ['owner'])
  assert.equal(homeForRole('cashier'), '/dashboard/pos')
})

test('owner registration rejects mismatched, too short, and excessive passwords', () => {
  const owner = { name: 'Test Owner', email: 'owner@example.com', password: 'long-test-password', confirmation: 'long-test-password' }
  assert.equal(registerSchema.safeParse(owner).success, true)
  assert.equal(registerSchema.safeParse({ ...owner, confirmation: 'different-password' }).success, false)
  assert.equal(registerSchema.safeParse({ ...owner, password: 'short', confirmation: 'short' }).success, false)
  assert.equal(registerSchema.safeParse({ ...owner, password: 'a'.repeat(129), confirmation: 'a'.repeat(129) }).success, false)
})
