'use client'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react'
import { CustomSelect } from '@/components/ui/custom-select'
import DashboardSection from './dashboard-section'
import type { AssistantRequest } from '@/lib/assistant'
import { chatBasisLabels, chatMoney, type ChatAnswer } from '@/lib/assistant-chat'

const prompts = ['Bantu susun ide barang baru dan rencana belanja.', 'Buatkan caption promosi toko.', 'Ringkas penjualan pada periode ini.', 'Stok apa yang perlu saya periksa?']
const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24cbc5]'
const time = (s: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(s)) + ' WIB'
type Turn = { id: string; question: string; period: AssistantRequest['period']; status: 'pending' | 'failed' | 'done'; answer?: ChatAnswer }

export default function BusinessAssistant({ configured }: { configured: boolean }) {
  const [question, setQuestion] = useState(''), [period, setPeriod] = useState<AssistantRequest['period']>('7d')
  const [turns, setTurns] = useState<Turn[]>([]), [pending, setPending] = useState(false), [error, setError] = useState('')
  const [loginRequired, setLoginRequired] = useState(false), [until, setUntil] = useState(0), [seconds, setSeconds] = useState(0), [away, setAway] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null), log = useRef<HTMLDivElement>(null), operation = useRef<AbortController | null>(null)
  const conversationToken = useRef<string | undefined>(undefined)
  const nearBottom = useRef(true)
  const jump = () => { const el = log.current; if (el) el.scrollTop = el.scrollHeight; nearBottom.current = true; setAway(false) }
  useEffect(() => () => operation.current?.abort(), [])
  useEffect(() => { const tick = () => setSeconds(Math.max(0, Math.ceil((until - Date.now()) / 1000))); tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer) }, [until])
  useEffect(() => { if (nearBottom.current) jump() }, [turns, pending])
  useEffect(() => {
    let frame = 0
    const resized = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(jump) }
    window.addEventListener('resize', resized)
    return () => { window.removeEventListener('resize', resized); cancelAnimationFrame(frame) }
  }, [])
  useEffect(() => { const el = input.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(120, Math.max(44, el.scrollHeight)) + 'px' } }, [question])
  const reset = () => { if (pending) return; conversationToken.current = undefined; setTurns([]); setQuestion(''); setError(''); setLoginRequired(false); nearBottom.current = true; setAway(false); input.current?.focus() }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (operation.current || pending || seconds || !configured) return
    const text = question.trim()
    if (text.length < 3) { setError('Tulis pesan minimal 3 karakter.'); input.current?.focus(); return }
    const last = turns[turns.length - 1], id = last?.status === 'failed' && last.question === text && last.period === period ? last.id : crypto.randomUUID()
    const turn: Turn = { id, question: text, period, status: 'pending' }
    const controller = new AbortController(); operation.current = controller
    const timer = setTimeout(() => controller.abort(), 90000)
    nearBottom.current = true; setAway(false); setPending(true); setError(''); setLoginRequired(false); setQuestion('')
    setTurns(previous => previous[previous.length - 1]?.id === id ? [...previous.slice(0, -1), turn] : [...previous.slice(-9), turn])
    try {
      const response = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text, period, conversationToken: conversationToken.current }), signal: controller.signal })
      const result = await response.json()
      if (!response.ok) {
        if (response.status === 401) setLoginRequired(true)
        if (response.status === 429) setUntil(Date.now() + Math.min(3600, Math.max(1, Number(result.retryAfter) || 60)) * 1000)
        throw Error(result.error || 'Asisten belum dapat menjawab. Coba lagi.')
      }
      if (!result.answer || !result.conversationToken) throw Error('Jawaban belum dapat dibaca. Coba lagi.')
      conversationToken.current = result.conversationToken
      setTurns(previous => previous.map(t => t.id === id ? { ...t, status: 'done', answer: result.answer } : t))
    } catch (e) {
      setTurns(previous => previous.map(t => t.id === id ? { ...t, status: 'failed' } : t))
      setQuestion(current => current.trim() ? current : text)
      setError(controller.signal.aborted ? 'Permintaan belum selesai. Tunggu sebentar sebelum mencoba lagi.' : e instanceof TypeError ? 'Koneksi terputus. Pesan belum berhasil diproses.' : e instanceof Error ? e.message : 'Asisten belum dapat menjawab.')
    } finally { clearTimeout(timer); operation.current = null; setPending(false) }
  }
  const keydown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit() }
  }
  return <DashboardSection title="Asisten Bisnis AI">
    <div className="flex h-[calc(100dvh-192px)] min-h-[440px] max-h-[1100px] w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl border border-[#454d5b] bg-[#1c222e]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#454d5b] bg-[#273242] px-3 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3"><img src="/brand/usahaku-logo.png" alt="" width={36} height={36} className="size-9 shrink-0 object-contain" /><div><h2 className="text-sm font-semibold">Usahaku</h2><p className="text-xs text-[#c5cbd5]">Asisten untuk UMKM</p></div></div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="assistant-period" className="sr-only">Periode penjualan (WIB)</label>
          <CustomSelect
  id="assistant-period"
  ariaLabel="Periode penjualan (WIB)"
  value={period}
  disabled={pending}
  size="sm"
  align="right"
  options={[
    { value: 'today', label: 'Hari ini (WIB)' },
    { value: '7d', label: '7 hari terakhir (WIB)' },
    { value: '30d', label: '30 hari terakhir (WIB)' },
  ]}
  onChange={val => {
    conversationToken.current = undefined
    setPeriod(val as AssistantRequest['period'])
  }}
  className="min-w-[150px]"
/>
          <button type="button" aria-label="Bersihkan percakapan" disabled={pending || !turns.length} onClick={reset} className={'flex min-h-11 min-w-11 items-center gap-2 rounded-xl px-3 text-xs text-[#c5cbd5] hover:bg-[#303640] disabled:opacity-50 ' + focus}><RotateCcw className="size-4" aria-hidden="true" /><span className="hidden sm:inline">Percakapan baru</span></button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={log} role="log" aria-label="Percakapan Asisten" aria-live="polite" aria-relevant="additions text" tabIndex={0} onScroll={() => { const el = log.current; if (el) { nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; setAway(!nearBottom.current) } }} className={'min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 sm:px-6 ' + focus}>
          {!turns.length && <div className="mx-auto flex min-h-full max-w-[600px] flex-col justify-center py-4">
            <p className="text-xs font-medium text-[#24cbc5]">Mulai percakapan</p><h3 className="mt-2 text-xl font-semibold sm:text-2xl">Apa yang ingin kamu kerjakan hari ini?</h3>
            <p className="mt-3 text-sm leading-6 text-[#c5cbd5]">Cari ide barang, susun promosi, rencanakan belanja, atau bahas penjualan dan stok. Ceritakan kebutuhanmu; saya bantu menyusun langkahnya.</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2" aria-label="Contoh pertanyaan">{prompts.map(prompt => <button key={prompt} type="button" disabled={!configured} onClick={() => { setQuestion(prompt); input.current?.focus() }} className={'min-h-11 rounded-xl border border-[#a4a7ac] bg-[#273242] p-3 text-left text-xs leading-5 text-[#c5cbd5] hover:bg-[#303640] disabled:opacity-60 ' + focus}>{prompt}</button>)}</div>
          </div>}
          <div className="space-y-6">
            {turns.map(turn => <div key={turn.id} className="min-w-0 space-y-4">
              <div className="flex justify-end"><div className="max-w-[90%] sm:max-w-[80%]"><p className="mb-1.5 text-right text-xs text-[#c5cbd5]">Kamu</p><div data-chat-message="user" className="whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-[#1835d9] px-4 py-3 text-sm leading-6 text-white [overflow-wrap:anywhere]">{turn.question}</div>{turn.status === 'failed' && <p className="mt-1 text-right text-xs text-[#ffb4ae]">Belum mendapat jawaban</p>}</div></div>
              {turn.status === 'pending' && <p role="status" className="px-1 text-sm text-[#c5cbd5]">Usahaku sedang menyiapkan jawaban...</p>}
              {turn.answer && <article aria-label="Jawaban Asisten" className="flex min-w-0 items-start gap-2 sm:gap-3">
                <img src="/brand/usahaku-logo.png" alt="" width={28} height={28} className="mt-1 size-7 shrink-0 object-contain" />
                <div data-chat-message="assistant" className="min-w-0 max-w-full rounded-2xl rounded-tl-sm border border-[#454d5b] bg-[#273242] px-4 py-3 sm:max-w-[85%] sm:p-4 [overflow-wrap:anywhere]">
                  <p className="text-xs font-semibold text-[#24cbc5]">Usahaku</p><p className="mt-1 text-[11px] text-[#c5cbd5]">{chatBasisLabels[turn.answer.basis]}</p>
                  {turn.answer.dataWarning && <p className="mt-2 text-xs text-[#ffcb8a]">{turn.answer.dataWarning}</p>}
                  <ChatText text={turn.answer.message} />
                  {turn.answer.assumptions.length > 0 && <div className="mt-3 text-xs leading-5 text-[#c5cbd5]"><p className="font-semibold">Asumsi yang dipakai</p><ul className="mt-1 list-disc pl-4">{turn.answer.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
                  {turn.answer.estimate && <EstimateView estimate={turn.answer.estimate} />}
                  <ul className="mt-2 list-disc space-y-2 pl-4 text-sm leading-6">{turn.answer.facts.map((fact, i) => <li key={i}>{fact}</li>)}</ul>
                  {turn.answer.suggestions.length > 0 && <><p className="mt-4 text-sm font-semibold">Yang bisa kamu pertimbangkan</p><ul className="mt-2 list-disc space-y-2 pl-4 text-sm leading-6 text-[#c5cbd5]">{turn.answer.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
                  {turn.answer.sources.length > 0 && <details className="mt-3 text-xs leading-5 text-[#c5cbd5]"><summary className={'min-h-11 cursor-pointer py-3 ' + focus}>Sumber dan waktu data</summary><p className="mt-1">Penjualan: {turn.answer.from} sampai {turn.answer.to} WIB. Dibaca {time(turn.answer.generatedAt)}. Stok saat ini, dibaca {time(turn.answer.stockAt)}. Data dapat berubah setelah dibaca.</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[#24cbc5]">{turn.answer.sources.map(source => <Link key={source} className={'inline-flex min-h-11 items-center underline underline-offset-4 ' + focus} href={source.startsWith('Inventori') ? '/dashboard/inventory' : `/dashboard/reports?from=${turn.answer!.from}&to=${turn.answer!.to}&payment=all`}>{source}</Link>)}</div>
                  </details>}
                </div>
              </article>}
            </div>)}
          </div>
        </div>
        {away && <button type="button" onClick={jump} className={'absolute bottom-3 left-1/2 flex min-h-11 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl border border-[#a4a7ac] bg-[#273242] px-3 text-xs text-white shadow-sm ' + focus}><ArrowDown className="size-4" aria-hidden="true" />Ke pesan terbaru</button>}
      </div>
      <form onSubmit={submit} className="shrink-0 border-t border-[#454d5b] bg-[#273242] p-3 sm:px-5 sm:py-4">
        {!configured && <p role="status" className="mb-3 text-sm text-[#c5cbd5]">Gemini belum dikonfigurasi. Hubungi pengelola aplikasi untuk mengaktifkannya.</p>}
        {error && <div role="alert" className="mb-3 rounded-xl bg-[#4a252b] p-3 text-sm text-[#ffb4ae]">{error}{loginRequired && <Link href="/login" className="ml-2 underline">Masuk kembali</Link>}</div>}
        <div className="flex items-end gap-2 rounded-xl border border-[#a4a7ac] bg-[#1c222e] p-1.5 focus-within:border-[#24cbc5] focus-within:ring-2 focus-within:ring-[#24cbc5]/30">
          <label htmlFor="assistant-question" className="sr-only">Pertanyaan</label><textarea id="assistant-question" ref={input} value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={keydown} maxLength={600} rows={1} disabled={!configured} placeholder="Tulis pesan untuk Usahaku..." aria-describedby="assistant-privacy" className="min-h-11 max-h-[120px] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2.5 text-sm leading-6 text-white outline-none disabled:opacity-60" />
          <button disabled={pending || seconds > 0 || !configured} type="submit" aria-label={pending ? 'Mengirim pesan' : 'Kirim pesan'} className={'grid size-11 shrink-0 place-items-center rounded-lg bg-[#1835d9] text-white hover:bg-[#132c9e] disabled:opacity-50 ' + focus}><ArrowUp className="size-5" aria-hidden="true" /></button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] leading-5 text-[#c5cbd5]"><span>{seconds ? `Tunggu ${seconds} detik sebelum mengirim lagi.` : 'Enter untuk kirim, Shift+Enter untuk baris baru.'}</span><span>{question.length}/600</span></div>
        <details className="mt-1 text-[11px] leading-5 text-[#c5cbd5]"><summary className={'min-h-11 w-fit cursor-pointer py-3 ' + focus}>Tentang data percakapan</summary><p id="assistant-privacy">Pesan dan beberapa balasan terakhir dikirim ke Google Gemini bersama ringkasan angka toko. Jangan tulis data pribadi. Rincian transaksi, nama pelanggan/staf dan kontak tidak disertakan otomatis. Saran umum dan estimasi bukan catatan database atau harga pasar terverifikasi. Asisten hanya membaca data. Satu putaran klarifikasi maksimal dalam satu percakapan; setelah kamu menjawab, Asisten langsung menyusun hasil dengan asumsi jika perlu. Maksimal sepuluh percakapan terakhir tampil selama halaman terbuka; percakapan baru, ganti periode atau reload mereset konteks.</p></details>
      </form>
    </div>
  </DashboardSection>
}


function ChatText({ text }: { text: string }) {
  const inline = (line: string) => line.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) => part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part)
  return <div className="mt-3 space-y-3 text-sm leading-6 [overflow-wrap:anywhere]">{text.split(/\n{2,}/).map((paragraph, i) => {
    const lines = paragraph.split('\n')
    if (lines.every(line => /^(?:[-*]|\d+[.)])\s+/.test(line))) return <ul key={i} className="list-disc space-y-1 pl-4">{lines.map((line, j) => <li key={j}>{inline(line.replace(/^(?:[-*]|\d+[.)])\s+/, ''))}</li>)}</ul>
    return <p key={i} className="whitespace-pre-wrap">{inline(paragraph.replace(/^#{1,4}\s+/gm, ''))}</p>
  })}</div>
}

function EstimateView({ estimate }: { estimate: NonNullable<ChatAnswer['estimate']> }) {
  const over = estimate.remaining !== null && BigInt(estimate.remaining) < BigInt(0)
  return <div className="mt-4 border-y border-[#454d5b] py-3 text-xs leading-5">
    <p className="font-semibold text-white">Perkiraan rencana belanja</p><p className="mt-1 text-[#c5cbd5]">Harga beli dan stok awal berikut adalah estimasi. Cocokkan dengan pemasok sebelum membeli.</p>
    {estimate.adjusted && <p className="mt-2 text-[#ffcb8a]">Rencana awal AI melebihi anggaran. Jumlah barang berikut disesuaikan otomatis agar muat, tanpa mengubah perkiraan harga satuannya.{estimate.removedItems > 0 ? ' Barang yang belum muat pada jumlah minimumnya tidak dimasukkan.' : ''}</p>}
    {!estimate.items.length && <p className="mt-2 text-[#ffcb8a]">Belum ada barang dalam rencana awal yang dapat dialokasikan dengan anggaran ini. Total di bawah tidak berarti barang sudah dibeli.</p>}
    <ul className="mt-2 divide-y divide-[#454d5b]">{estimate.items.map((item, i) => <li key={i} className="py-2"><div className="flex flex-wrap justify-between gap-x-4"><span className="min-w-0 font-medium">{item.name}</span><strong className="whitespace-nowrap">{chatMoney(item.total)}</strong></div><p className="text-[#c5cbd5]">{item.quantity.toLocaleString('id-ID', { maximumFractionDigits: 3 })} {item.unit} dengan harga {chatMoney(String(item.unitCost))} / {item.unit}</p></li>)}</ul>
    <dl className="mt-3 space-y-1 border-t border-[#454d5b] pt-3"><div className="flex flex-wrap justify-between gap-x-4 font-semibold"><dt>Total estimasi</dt><dd>{chatMoney(estimate.total)}</dd></div>{estimate.budget !== null && <div className="flex flex-wrap justify-between gap-x-4"><dt>Anggaran dari percakapan</dt><dd>{chatMoney(estimate.budget)}</dd></div>}{estimate.remaining !== null && <div className={'flex flex-wrap justify-between gap-x-4 ' + (over ? 'text-[#ffcb8a]' : 'text-[#c5cbd5]')}><dt>{over ? 'Melebihi anggaran' : 'Sisa untuk cadangan'}</dt><dd>{chatMoney((over ? -BigInt(estimate.remaining) : BigInt(estimate.remaining)).toString())}</dd></div>}</dl>
    {over && <p className="mt-2 text-[#ffcb8a]">Rencana ini melebihi anggaran. Kurangi jumlah atau pilih barang prioritas sebelum membeli.</p>}
  </div>
}
