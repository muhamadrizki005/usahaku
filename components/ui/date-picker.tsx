'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Popover } from '@base-ui/react/popover'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { calendarAddDays, calendarCells, calendarDate, calendarLabel, calendarMax, calendarMin, calendarMonths, calendarMoveMonth, calendarToday } from '@/lib/calendar-date'

type Props = {
  value: string
  onChange: (value: string) => void
  label: string
  withTime?: boolean
  disabled?: boolean
  id?: string
  'aria-labelledby'?: string
  className?: string
}
const control = 'min-h-10 rounded-lg border border-[#454d5b] bg-[#273242] px-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-[#24cbc5] disabled:opacity-40'
const bounded = (value: string) => value < calendarMin ? calendarMin : value > calendarMax ? calendarMax : value

export function DatePicker({ value, onChange, label, withTime = false, disabled, id, className = '', 'aria-labelledby': labelledBy }: Props) {
  const generatedId = useId(), titleId = generatedId+'-month', timeId = generatedId+'-time'
  const trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null), requestedFocus = useRef(false)
  const [open,setOpen] = useState(false), [container,setContainer] = useState<HTMLElement | null>(null)
  const [draft,setDraft] = useState(value.slice(0,10)), [time,setTime] = useState(value.slice(11,16) || '19:00'), [focused,setFocused] = useState(value.slice(0,10)), [month,setMonth] = useState(value.slice(0,7)), [today,setToday] = useState('')
  const year = Number(month.slice(0,4)), monthNumber = Number(month.slice(5,7))-1
  const cells = calendarCells(month)
  function changeOpen(next: boolean) {
    if (next) {
      const currentToday = bounded(calendarToday()), selected = calendarDate(value.slice(0,10)) ? value.slice(0,10) : currentToday
      setDraft(selected);setFocused(selected);setMonth(selected.slice(0,7));setTime(value.slice(11,16) || '19:00');setToday(currentToday)
      setContainer(trigger.current?.closest('dialog') || null)
    }
    setOpen(next)
  }
  useEffect(()=>{
    if (!open || !requestedFocus.current) return
    requestedFocus.current = false
    popup.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus()
  },[open,focused,month])
  function moveFocus(next: string) {
    next = bounded(next)
    requestedFocus.current = true;setFocused(next);setMonth(next.slice(0,7))
  }
  function dayKey(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const parsed = calendarDate(date)
    if (!parsed) return
    const weekday = (parsed.getUTCDay()+6)%7
    const offsets: Record<string,number> = {ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-weekday,End:6-weekday}
    if (event.key in offsets) {event.preventDefault();moveFocus(calendarAddDays(date,offsets[event.key]))}
    else if (event.key==='PageUp' || event.key==='PageDown') {event.preventDefault();moveFocus(calendarMoveMonth(date,(event.key==='PageUp'?-1:1)*(event.shiftKey?12:1)))}
  }
  function choose(date: string) {
    setDraft(date);setFocused(date);setMonth(date.slice(0,7))
    if (!withTime) {onChange(date);setOpen(false)}
  }
  function showMonth(next: string) {
    next = bounded(next);setMonth(next.slice(0,7));setFocused(next)
  }
  const formatted = calendarLabel(value.slice(0,10))+(withTime && value.slice(11,16) ? ' · '+value.slice(11,16)+' WIB' : '')
  return <Popover.Root open={open} onOpenChange={changeOpen}>
    <Popover.Trigger ref={trigger} id={id || generatedId} aria-labelledby={labelledBy} aria-label={labelledBy?undefined:label} disabled={disabled}
      onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();if(!open)event.currentTarget.click()}}}
      className={'flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-[#454d5b] bg-[#273242] px-3 py-2 text-left text-sm font-normal text-white outline-none focus-visible:ring-2 focus-visible:ring-[#24cbc5] disabled:opacity-50 '+className}>
      <span className="min-w-0 break-words">{formatted}</span><CalendarDays aria-hidden="true" className="size-4 shrink-0 text-[#c5cbd5]"/>
    </Popover.Trigger>
    <Popover.Portal container={container || undefined}>
      <Popover.Positioner side="bottom" align="start" sideOffset={8} collisionPadding={12} positionMethod="fixed" className="z-[100] max-w-[calc(100vw-48px)]">
        <Popover.Popup ref={popup} aria-label={'Kalender '+label} finalFocus={trigger}
          initialFocus={()=>popup.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`) || popup.current}
          onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false)}}}
          className="w-[336px] max-w-[calc(100vw-48px)] overflow-y-auto rounded-xl border border-[#454d5b] bg-[#273242] p-3 text-white shadow-xl outline-none"
          style={{maxHeight:'var(--available-height)'}}>
          <div className="flex items-center justify-between gap-2">
            <button type="button" aria-label="Bulan sebelumnya" disabled={month==='2000-01'} onClick={()=>showMonth(calendarMoveMonth(month+'-01',-1))} className={control+' grid size-10 shrink-0 place-items-center px-0'}><ChevronLeft aria-hidden="true" className="size-4"/></button>
            <div className="flex min-w-0 items-center gap-1">
              <select aria-label="Bulan kalender" value={monthNumber} onChange={e=>showMonth(`${year}-${String(Number(e.target.value)+1).padStart(2,'0')}-01`)} className="min-h-10 min-w-0 max-w-32 rounded-lg bg-[#273242] text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-[#24cbc5]">{calendarMonths.map((name,i)=><option key={name} value={i}>{name}</option>)}</select>
              <select aria-label="Tahun kalender" value={year} onChange={e=>showMonth(`${e.target.value}-${String(monthNumber+1).padStart(2,'0')}-01`)} className="min-h-10 min-w-0 rounded-lg bg-[#273242] text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-[#24cbc5]">{Array.from({length:100},(_,i)=>2000+i).map(y=><option key={y} value={y}>{y}</option>)}</select>
            </div>
            <button type="button" aria-label="Bulan berikutnya" disabled={month==='2099-12'} onClick={()=>showMonth(calendarMoveMonth(month+'-01',1))} className={control+' grid size-10 shrink-0 place-items-center px-0'}><ChevronRight aria-hidden="true" className="size-4"/></button>
          </div>
          <span id={titleId} aria-live="polite" className="sr-only">{calendarMonths[monthNumber]} {year}</span>
          <table role="grid" aria-labelledby={titleId} className="mt-3 w-full table-fixed border-separate border-spacing-y-1 text-center text-sm">
            <thead><tr>{['Sen','Sel','Rab','Kam','Jum','Sab','Min'].map(d=><th key={d} scope="col" className="pb-1 text-xs font-normal text-[#c5cbd5]">{d}</th>)}</tr></thead>
            <tbody>{Array.from({length:6},(_,week)=><tr key={week}>{cells.slice(week*7,week*7+7).map(date=>{
              const selected = date===draft, currentMonth = date.slice(0,7)===month, unavailable = date<calendarMin || date>calendarMax
              return <td key={date} role="gridcell" aria-selected={selected} className="p-0.5"><button type="button" data-day={date} aria-label={calendarLabel(date)} aria-current={date===today?'date':undefined} disabled={unavailable} tabIndex={focused===date?0:-1} onFocus={()=>setFocused(date)} onKeyDown={e=>dayKey(e,date)} onClick={()=>choose(date)}
                className={'grid min-h-10 w-full place-items-center rounded-lg text-sm outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-25 '+(selected?'bg-[#1835d9] font-semibold text-white':currentMonth?'text-white hover:bg-[#303640]':'text-[#a4a7ac] hover:bg-[#303640]')+(date===today?' ring-1 ring-inset ring-[#24cbc5]':'')}>{Number(date.slice(8))}</button></td>
            })}</tr>)}</tbody>
          </table>
          {withTime&&<div className="mt-3 border-t border-[#454d5b] pt-3"><label htmlFor={timeId} className="block text-xs text-[#c5cbd5]">Jam kedatangan (WIB)</label><input id={timeId} type="time" required value={time} onChange={e=>setTime(e.target.value)} className={control+' mt-1 w-full px-3'}/></div>}
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#454d5b] pt-3">
            <button type="button" onClick={()=>choose(today)} className="min-h-10 rounded-lg px-2 text-sm text-[#24cbc5] outline-none focus-visible:ring-2 focus-visible:ring-[#24cbc5]">Hari ini</button>
            {withTime?<button type="button" disabled={!calendarDate(draft)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)} onClick={()=>{onChange(draft+'T'+time);setOpen(false)}} className="min-h-10 rounded-lg bg-[#1835d9] px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-[#24cbc5] disabled:opacity-40">Pilih tanggal dan jam</button>:<Popover.Close className={control+' px-3'}>Tutup</Popover.Close>}
          </div>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>
}
