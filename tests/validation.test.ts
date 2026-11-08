import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staffSchema, staffLoginSchema, staffEmail, registerSchema, businessSchema } from '../lib/validation';

test('staff username cannot introduce an alternate tenant/email identity', () => {
  for (const username of ['a.b', 'a@b', 'ab', '../owner', 'a+b', 'x'.repeat(25)]) {
    assert.equal(staffSchema.safeParse({ name: 'Budi', username, role: 'cashier' }).success, false);
  }
  const value = staffLoginSchema.parse({ code: ' abcd1234 ', username: ' BUDI ', password: 'temporary-password' });
  assert.equal(staffEmail(value.code, value.username), 'abcd1234.budi@staff.usahaku.invalid');
  assert.notEqual(staffEmail('ABCD1234', 'budi'), staffEmail('ABCD5678', 'budi'));
});
test('only owner-created admin/cashier roles are accepted by staff creation', () => {
  assert.equal(staffSchema.safeParse({ name: 'Budi', username: 'budi', role: 'owner' }).success, false);
  assert.equal(staffSchema.safeParse({ name: 'Budi', username: 'budi', role: 'admin' }).success, true);
});
test('registration and business details enforce actual limits', () => {
  assert.equal(registerSchema.safeParse({ name: 'Owner', email: 'invalid', password: '1234567890' }).success, false);
  assert.equal(registerSchema.safeParse({ name: 'Owner', email: 'owner@example.com', password: 'short' }).success, false);
  assert.equal(businessSchema.safeParse({ name: ' ', ownerName: 'Owner', phone: '', address: '' }).success, false);
});
test('password validation enforces all 5 criteria', () => {
  const base = { name: 'Owner', email: 'owner@example.com' };
  assert.equal(registerSchema.safeParse({ ...base, password: 'Pass1!', confirmation: 'Pass1!' }).success, false);
  assert.equal(registerSchema.safeParse({ ...base, password: 'password123!', confirmation: 'password123!' }).success, false);
  assert.equal(registerSchema.safeParse({ ...base, password: 'PASSWORD123!', confirmation: 'PASSWORD123!' }).success, false);
  assert.equal(registerSchema.safeParse({ ...base, password: 'Password!!!!', confirmation: 'Password!!!!' }).success, false);
  assert.equal(registerSchema.safeParse({ ...base, password: 'Password123', confirmation: 'Password123' }).success, false);
  assert.equal(registerSchema.safeParse({ ...base, password: 'Password123!', confirmation: 'Password123!' }).success, true);
});
