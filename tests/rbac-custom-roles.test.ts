import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import {
  MODULE_DEFINITIONS,
  ALL_PERMISSIONS,
  DEFAULT_ADMIN_PERMISSIONS,
  DEFAULT_CASHIER_PERMISSIONS,
  normalizeRoleKey,
  resolveMemberPermissions,
  hasPermission,
  canAccessPath,
  getRoleDisplayName,
  type BusinessRole,
} from '../lib/auth/rbac'
import { staffSchema, roleSchema } from '../lib/validation'

test('RBAC: module definitions and permission catalog are well-formed', () => {
  assert.ok(MODULE_DEFINITIONS.length >= 9)
  const expectedModules = [
    'overview',
    'products',
    'inventory',
    'pos',
    'transactions',
    'customers',
    'reports',
    'staff',
    'settings',
  ]
  const moduleIds = MODULE_DEFINITIONS.map(m => m.id)
  for (const id of expectedModules) {
    assert.ok(moduleIds.includes(id as any), `Module ${id} must exist in definitions`)
  }

  // All permissions should have unique keys
  const keys = new Set<string>()
  for (const mod of MODULE_DEFINITIONS) {
    assert.ok(mod.label.length > 0)
    assert.ok(mod.permissions.length > 0)
    for (const perm of mod.permissions) {
      assert.ok(!keys.has(perm.key), `Duplicate permission key: ${perm.key}`)
      keys.add(perm.key)
    }
  }

  assert.equal(ALL_PERMISSIONS.length, keys.size)
})

test('RBAC: permission resolution and role display names', () => {
  const supervisorRole: BusinessRole = {
    id: 'role-sup-1',
    business_id: 'biz-1',
    name: 'Supervisor',
    description: 'Pengawas operasional toko',
    is_default: false,
    permissions: [
      'products:view',
      'products:create',
      'pos:view',
      'pos:create',
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const businessRoles = [supervisorRole]

  // 1. Owner always gets ALL permissions
  const ownerPerms = resolveMemberPermissions('owner', businessRoles)
  assert.deepEqual(ownerPerms, ALL_PERMISSIONS)
  assert.equal(hasPermission('owner', ownerPerms, 'anything:view'), true)
  assert.equal(hasPermission('owner', ownerPerms, 'settings:edit'), true)

  // 2. Admin Toko / admin preset
  const adminPerms = resolveMemberPermissions('admin', businessRoles)
  assert.deepEqual(adminPerms, DEFAULT_ADMIN_PERMISSIONS)
  assert.equal(hasPermission('admin', adminPerms, 'products:view'), true)
  assert.equal(hasPermission('admin', adminPerms, 'reports:export'), true)
  assert.equal(hasPermission('admin', adminPerms, 'settings:edit'), false)

  // 3. Petugas Kasir / cashier preset
  const cashierPerms = resolveMemberPermissions('cashier', businessRoles)
  assert.deepEqual(cashierPerms, DEFAULT_CASHIER_PERMISSIONS)
  assert.equal(hasPermission('cashier', cashierPerms, 'pos:view'), true)
  assert.equal(hasPermission('cashier', cashierPerms, 'pos:create'), true)
  assert.equal(hasPermission('cashier', cashierPerms, 'products:edit'), false)
  assert.equal(hasPermission('cashier', cashierPerms, 'reports:view'), false)

  // 4. Custom role Supervisor by name or ID
  const supByName = resolveMemberPermissions('Supervisor', businessRoles)
  assert.deepEqual(supByName, supervisorRole.permissions)
  const supById = resolveMemberPermissions('role-sup-1', businessRoles)
  assert.deepEqual(supById, supervisorRole.permissions)

  assert.equal(hasPermission('Supervisor', supByName, 'products:view'), true)
  assert.equal(hasPermission('Supervisor', supByName, 'products:create'), true)
  assert.equal(hasPermission('Supervisor', supByName, 'pos:view'), true)
  assert.equal(hasPermission('Supervisor', supByName, 'pos:create'), true)
  // Unauthorized for Supervisor
  assert.equal(hasPermission('Supervisor', supByName, 'products:delete'), false)
  assert.equal(hasPermission('Supervisor', supByName, 'pos:cancel'), false)
  assert.equal(hasPermission('Supervisor', supByName, 'reports:view'), false)
  assert.equal(hasPermission('Supervisor', supByName, 'settings:view'), false)

  // Display names
  assert.equal(getRoleDisplayName('owner', businessRoles), 'Pemilik usaha')
  assert.equal(getRoleDisplayName('admin', businessRoles), 'Admin Toko')
  assert.equal(getRoleDisplayName('cashier', businessRoles), 'Petugas Kasir')
  assert.equal(getRoleDisplayName('Supervisor', businessRoles), 'Supervisor')
  assert.equal(getRoleDisplayName('role-sup-1', businessRoles), 'Supervisor')
})

test('RBAC: route path access control (canAccessPath)', () => {
  const supervisorPermissions = [
    'products:view',
    'products:create',
    'pos:view',
    'pos:create',
  ]

  // Owner can access all dashboard paths
  for (const path of [
    '/dashboard',
    '/dashboard/products',
    '/dashboard/inventory',
    '/dashboard/pos',
    '/dashboard/transactions',
    '/dashboard/customers',
    '/dashboard/reports',
    '/dashboard/settings/staff',
    '/dashboard/settings',
  ]) {
    assert.equal(canAccessPath(path, 'owner', ALL_PERMISSIONS), true, `Owner should access ${path}`)
  }

  // Supervisor can access Products and POS
  assert.equal(canAccessPath('/dashboard/products', 'Supervisor', supervisorPermissions), true)
  assert.equal(canAccessPath('/dashboard/pos', 'Supervisor', supervisorPermissions), true)

  // Supervisor cannot access restricted modules
  assert.equal(canAccessPath('/dashboard', 'Supervisor', supervisorPermissions), false)
  assert.equal(canAccessPath('/dashboard/inventory', 'Supervisor', supervisorPermissions), false)
  assert.equal(canAccessPath('/dashboard/transactions', 'Supervisor', supervisorPermissions), false)
  assert.equal(canAccessPath('/dashboard/customers', 'Supervisor', supervisorPermissions), false)
  assert.equal(canAccessPath('/dashboard/reports', 'Supervisor', supervisorPermissions), false)
  assert.equal(canAccessPath('/dashboard/settings', 'Supervisor', supervisorPermissions), false)
  assert.equal(canAccessPath('/dashboard/settings/staff', 'Supervisor', supervisorPermissions), false)
})

test('RBAC: validation schemas for custom roles and staff creation', () => {
  // Valid role creation
  const validRole = roleSchema.safeParse({
    name: 'Supervisor Toko',
    description: 'Pengawas operasional harian toko',
    permissions: ['products:view', 'pos:view', 'pos:create'],
  })
  assert.equal(validRole.success, true)

  // Invalid role creations
  assert.equal(roleSchema.safeParse({ name: 'A', permissions: [] }).success, false) // Too short (<2)
  assert.equal(roleSchema.safeParse({ name: 'x'.repeat(65), permissions: [] }).success, false) // Too long (>60)

  // Staff creation with custom role name
  assert.equal(
    staffSchema.safeParse({
      name: 'Rudi',
      username: 'rudi_sup',
      role: 'Supervisor Toko',
    }).success,
    true
  )

  // Staff creation with default roles
  assert.equal(staffSchema.safeParse({ name: 'Budi', username: 'budi_admin', role: 'admin' }).success, true)
  assert.equal(staffSchema.safeParse({ name: 'Siti', username: 'siti_cashier', role: 'cashier' }).success, true)

  // Staff creation CANNOT assign 'owner'
  assert.equal(staffSchema.safeParse({ name: 'Hacker', username: 'fake_owner', role: 'owner' }).success, false)
  assert.equal(staffSchema.safeParse({ name: 'Hacker', username: 'fake_owner', role: 'OWNER' }).success, false)
})

test('RBAC: database integration, multi-tenancy, default seeding and custom role lifecycle', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,raw_app_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;grant usage on schema storage to authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated;grant all on storage.objects,storage.buckets to service_role;`)

    const migrationFiles = [
      '202610200001_foundation.sql',
      '202610210001_profile_setup.sql',
      '202610220001_catalog_inventory.sql',
      '202610220002_bulk_catalog.sql',
      '202610220003_product_image_policy.sql',
      '202610220004_pos_transactions.sql',
      '202610220005_customers.sql',
      '202610230001_sales_reports.sql',
      '202610230002_onboarding_completion.sql',
      '202610230003_auto_product_sku.sql',
      '202611010001_product_discounts_tax.sql',
      '202611010002_business_payments.sql',
      '202611010003_optional_payment_methods.sql',
      '202611010004_receipt_numbers.sql',
      '202611010005_pos_order_discounts.sql',
      '202611010006_loyalty_points.sql',
      '202611010007_business_payments_ewallet.sql',
      '202611010008_custom_categories_and_units.sql',
      '202611010009_custom_roles_and_rbac.sql',
    ]

    for (const file of migrationFiles) {
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'))
    }

    const ownerA = randomUUID()
    const ownerB = randomUUID()
    await db.exec(`insert into auth.users (id) values ('${ownerA}'), ('${ownerB}')`)

    // Create Business A (Toko A)
    const bizARes = await db.query<{ id: string }>(`
      insert into public.businesses (owner_id, name, phone, address, code)
      values ('${ownerA}', 'Toko Sembako A', '0811111111', 'Jl. Toko A', 'TOKOA001')
      returning id
    `)
    const bizAId = bizARes.rows[0].id

    await db.exec(`
      insert into public.business_members (business_id, user_id, name, role)
      values ('${bizAId}', '${ownerA}', 'Pemilik A', 'owner')
    `)

    // Create Business B (Toko B)
    const bizBRes = await db.query<{ id: string }>(`
      insert into public.businesses (owner_id, name, phone, address, code)
      values ('${ownerB}', 'Toko Pakaian B', '0822222222', 'Jl. Toko B', 'TOKOB002')
      returning id
    `)
    const bizBId = bizBRes.rows[0].id

    await db.exec(`
      insert into public.business_members (business_id, user_id, name, role)
      values ('${bizBId}', '${ownerB}', 'Pemilik B', 'owner')
    `)

    // 1. Verify default roles are automatically seeded for both Toko A and Toko B
    const rolesA = await db.query<{ name: string; is_default: boolean }>(`
      select name, is_default from public.business_roles where business_id = '${bizAId}' order by name
    `)
    assert.equal(rolesA.rows.length, 2)
    assert.equal(rolesA.rows[0].name, 'Admin Toko')
    assert.equal(rolesA.rows[0].is_default, true)
    assert.equal(rolesA.rows[1].name, 'Petugas Kasir')
    assert.equal(rolesA.rows[1].is_default, true)

    const rolesB = await db.query<{ name: string }>(`
      select name from public.business_roles where business_id = '${bizBId}' order by name
    `)
    assert.equal(rolesB.rows.length, 2)

    // 2. Owner of Toko A creates custom role "Supervisor"
    const supPerms = JSON.stringify(['products:view', 'products:create', 'pos:view', 'pos:create'])
    const supRoleRes = await db.query<{ id: string }>(`
      insert into public.business_roles (business_id, name, description, is_default, permissions)
      values ('${bizAId}', 'Supervisor', 'Pengawas cabang A', false, '${supPerms}'::jsonb)
      returning id
    `)
    const supRoleId = supRoleRes.rows[0].id
    assert.ok(supRoleId)

    // 3. Unique role name enforcement per business (case-insensitive)
    await assert.rejects(
      async () => {
        await db.exec(`
          insert into public.business_roles (business_id, name, description, permissions)
          values ('${bizAId}', 'supervisor', 'Duplicate supervisor', '[]'::jsonb)
        `)
      },
      /unique/i
    )

    // 4. Multi-tenancy: "Supervisor" in Toko A does NOT appear in Toko B
    const rolesBAfter = await db.query<{ name: string }>(`
      select name from public.business_roles where business_id = '${bizBId}' and lower(name) = 'supervisor'
    `)
    assert.equal(rolesBAfter.rows.length, 0, 'Toko B must not see Toko A custom roles')

    // 5. Assign staff member in Toko A to role "Supervisor"
    const staffUser = randomUUID()
    await db.exec(`insert into auth.users (id) values ('${staffUser}')`)
    await db.exec(`
      insert into public.business_members (business_id, user_id, name, username, role)
      values ('${bizAId}', '${staffUser}', 'Doni Supervisor', 'doni_sup', 'Supervisor')
    `)

    // Verify member count for Supervisor is 1
    const countRes = await db.query<{ count: string }>(`
      select count(*)::text as count from public.business_members
      where business_id = '${bizAId}' and (role = 'Supervisor' or role = '${supRoleId}')
    `)
    assert.equal(countRes.rows[0].count, '1')

    // 6. Deletion safety: built-in roles cannot be deleted
    // (Checked by policy: is_default = false)
    const adminRoleId = (await db.query<{ id: string }>(`
      select id from public.business_roles where business_id = '${bizAId}' and name = 'Admin Toko'
    `)).rows[0].id

    // As owner authenticated user
    await db.exec(`
      set role authenticated;
      set "request.jwt.claim.sub" = '${ownerA}';
    `)
    await db.exec(`delete from public.business_roles where id = '${adminRoleId}'`)
    const stillAdmin = await db.query(`select id from public.business_roles where id = '${adminRoleId}'`)
    assert.equal(stillAdmin.rows.length, 1, 'Default role Admin Toko cannot be deleted')
    await db.exec(`reset role;`)

    // 7. Dynamic Permission Update: Owner edits Supervisor permissions to add reports:view
    const updatedPerms = JSON.stringify(['products:view', 'products:create', 'pos:view', 'pos:create', 'reports:view'])
    await db.exec(`
      update public.business_roles
      set permissions = '${updatedPerms}'::jsonb, updated_at = now()
      where id = '${supRoleId}'
    `)

    const reloadedRole = (await db.query<{ permissions: string[] }>(`
      select permissions from public.business_roles where id = '${supRoleId}'
    `)).rows[0]
    assert.deepEqual(reloadedRole.permissions, ['products:view', 'products:create', 'pos:view', 'pos:create', 'reports:view'])

    // Immediately affects permission resolution for Doni Supervisor
    const allAroles = (await db.query<BusinessRole>(`select * from public.business_roles where business_id = '${bizAId}'`)).rows
    const doniPerms = resolveMemberPermissions('Supervisor', allAroles)
    assert.ok(doniPerms.includes('reports:view'), 'Supervisor permissions immediately reflect database update')

    // 8. Role deletion when assigned vs unassigned
    // When assigned, our application logic prevents deletion.
    // If staff changes role to cashier:
    await db.exec(`
      update public.business_members set role = 'cashier' where user_id = '${staffUser}'
    `)
    // Now supervisor role can be deleted
    await db.exec(`delete from public.business_roles where id = '${supRoleId}' and is_default = false`)
    const supRoleAfterDelete = await db.query(`select id from public.business_roles where id = '${supRoleId}'`)
    assert.equal(supRoleAfterDelete.rows.length, 0, 'Unassigned custom role can be deleted')

  } finally {
    await db.close()
  }
})
