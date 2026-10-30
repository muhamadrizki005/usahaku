'use client'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { StaffForm, StaffActions } from '@/components/account-forms'
import { roleNames } from '@/lib/auth/permissions'
import type { Member } from '@/lib/validation'
export function StaffManagement({ members }: { members: Member[] }) {
const [staffForm,setStaffForm]=useState(false)
return <div className="flex flex-col gap-4"><p className="text-sm text-[#a4a7ac]">Atur siapa saja yang dapat mengakses dan mengelola usaha Anda.</p>{members.map(person => person.role === 'owner' ? <div key={person.id} className="rounded-xl border border-[#454d5b] p-4"><p className="font-normal">Pemilik usaha</p><p className="mt-1 text-sm">{person.name}</p><p className="text-xs text-[#a4a7ac]">Owner (Pemilik)</p></div> : <div key={person.id} data-testid={`staff-${person.username}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#454d5b] p-4"><div className="min-w-0 flex-1"><p className="truncate font-normal">{person.name}</p><p className="truncate text-sm text-[#a4a7ac]">{person.username} · {roleNames[person.role]}</p><span className="text-xs text-[#a4a7ac]">{!person.active ? 'Nonaktif' : person.must_change_password ? 'Wajib ganti kata sandi' : 'Aktif'}</span></div><StaffActions member={person} /></div>)}<div className="flex justify-end"><button type="button" onClick={() => setStaffForm(true)} className="grid size-9 place-items-center rounded-lg border border-[#454d5b] text-[#24cbc5]" aria-label="Tambah staf"><Plus className="size-4" /></button></div>{staffForm && <StaffForm disabled={false} onCancel={() => setStaffForm(false)} />}</div>
}
