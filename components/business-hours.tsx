'use client'
import { useActionState, useEffect, useState, startTransition } from 'react'
import { saveBusinessHours } from '@/app/actions'
import { businessHoursSchema } from '@/lib/business-profile'
import type { Business } from '@/lib/validation'
type Hours = Record<string, { open: string; close: string; closed: boolean }>
const days = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu']
export const defaultHours = (): Hours => Object.fromEntries(days.map(day => [day, {open:'09:00',close:'21:00',closed:true}])) as Hours
const input = 'min-w-0 w-full h-10 rounded-lg border border-[#454d5b] bg-[#273242] px-3 text-sm outline-none focus:border-[#24cbc5] focus:ring-2 focus:ring-[#24cbc5]/20'
export function BusinessHoursSettings({ business }: { business: Business }) {
  const [state, dispatch, pending] = useActionState(saveBusinessHours, {})
  const [saved, setSaved] = useState(business)
  const [hours, setHours] = useState<Hours>(business.operating_hours || defaultHours())
  const [error, setError] = useState('')
  useEffect(() => { setError(state.error || ''); if (state.business) { setSaved(state.business); setHours(state.business.operating_hours || defaultHours()) } }, [state])
  const save = () => {
    if (pending) return
    const parsed = businessHoursSchema.safeParse(hours)
    if (!parsed.success) return setError(parsed.error.issues[0].message)
    setError('')
    const form = new FormData()
    form.set('revision', String(saved.hours_revision || 0))
    form.set('schedule', JSON.stringify(parsed.data))
    startTransition(() => dispatch(form))
  }
  return <section aria-label="Jam operasional" className="mt-8 rounded-xl border border-[#454d5b] bg-[#273242] p-5 sm:p-6">
    <h2 className="mb-4 text-lg font-normal">Jam operasional</h2>
    <HoursEditor hours={hours} setHours={setHours} save={save} pending={pending} error={error} cancel={() => {setHours(saved.operating_hours || defaultHours()); setError('')}} />
    {state.success && !error && <p role="status" className="mt-3 text-sm text-[#a4a7ac]">{state.success}</p>}
  </section>
}
export function HoursEditor({hours,setHours,save,error,cancel,pending}:{hours:Hours;setHours:(h:Hours)=>void;save:()=>void;error:string;cancel:()=>void;pending:boolean}) { const update=(day:string,key:string,value:string|boolean)=>setHours({...hours,[day]:{...hours[day],[key]:value}}); return <div><p className="mb-4 text-sm text-[#a4a7ac]">WIB. Jam tutup lebih awal berarti hari berikutnya. Jam sama dan jadwal tumpang tindih tidak diperbolehkan.</p><button type="button" onClick={()=>{const source=days.find(d=>!hours[d].closed)||days[0]; setHours(Object.fromEntries(days.map(d=>[d,{open:hours[source].open,close:hours[source].close,closed:false}])) as Hours)}} className="mb-3 rounded-full border border-[#454d5b] px-4 py-2 text-sm font-normal text-[#24cbc5]">Aktifkan semua hari</button>{days.map(d=><div className={`mb-2 grid grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border p-2 transition-colors ${hours[d].closed ? 'border-[#454d5b]/50 bg-[#1c222e] text-[#a4a7ac] [&_input]:opacity-40' : 'border-[#454d5b] bg-[#273242] text-[#ffffff]'}`} key={d}><b className="text-sm">{d}</b><input type="time" className={input} disabled={hours[d].closed} value={hours[d].open} onChange={e=>update(d,'open',e.target.value)}/><input type="time" className={input} disabled={hours[d].closed} value={hours[d].close} onChange={e=>update(d,'close',e.target.value)}/><button type="button" aria-label={`${d} ${hours[d].closed ? 'dibuka' : 'ditutup'}`} aria-pressed={!hours[d].closed} onClick={()=>update(d,'closed',!hours[d].closed)} className={`grid size-7 place-items-center rounded-full border-2 ${hours[d].closed ? 'border-[#454d5b] bg-transparent' : 'border-[#1835d9] bg-[#273242]'}`}><span className={`size-2.5 rounded-full ${hours[d].closed ? 'bg-transparent' : 'bg-[#1835d9]'}`} /></button></div>)}<Footer cancel={pending?()=>{}:cancel} save={save} label={pending?'Menyimpan...':'Simpan jam operasional'} error={error}/></div> }
function Footer({cancel,save,label,error}:{cancel:()=>void;save:()=>void;label:string;error:string}){return <><p className="mt-4 min-h-5 text-sm text-[#ffb4ae]">{error}</p><div className="mt-4 flex justify-end gap-3"><button onClick={cancel} className="rounded-lg border px-4 py-2.5 text-sm font-normal text-[#a4a7ac]">Batal</button><button onClick={save} className="rounded-lg bg-[#1835d9] px-4 py-2.5 text-sm font-normal text-white">{label}</button></div></>}
