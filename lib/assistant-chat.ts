import { z } from 'zod'
import { reportMoney } from './reports'
import type { AssistantAnswer, AssistantContext } from './assistant'

export const chatRequest = z.object({
  question: z.string().trim().min(3).max(600),
  period: z.enum(['today', '7d', '30d']),
  conversationToken: z.string().max(48000).optional(),
}).strict()
export const chatDraftSchema = z.object({
  mode: z.enum(['answer', 'clarification']),
  basis: z.enum(['general', 'store_data', 'estimate']),
  message: z.string().trim().min(2).max(5000),
  factIds: z.array(z.string()).max(8),
  assumptions: z.array(z.string().trim().min(1).max(240)).max(4),
  items: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    quantity: z.number().positive().max(1000000).refine(q => Math.abs(q * 1000 - Math.round(q * 1000)) < 0.000001),
    unit: z.string().trim().min(1).max(20),
    unitCost: z.number().int().min(0).max(999999999999),
  }).strict()).max(8),
}).strict()
export type ChatDraft = z.infer<typeof chatDraftSchema>
export type Estimate = { items: (ChatDraft['items'][number] & { total: string })[]; total: string; budget: string | null; remaining: string | null; adjusted: boolean; originalTotal: string; removedItems: number }
export type ChatAnswer = AssistantAnswer & { message: string; mode: ChatDraft['mode']; basis: ChatDraft['basis']; assumptions: string[]; estimate: Estimate | null; dataWarning?: string }
export const chatBasisLabels = { general: 'Saran umum AI', store_data: 'Berdasarkan ringkasan data toko', estimate: 'Estimasi dan asumsi, bukan harga pasar terverifikasi' }

export function inferBudget(question: string, fallback: number | null = null, allowBareMoney = false): number | null {
  const words: Record<string, string> = { satu: '1', dua: '2', tiga: '3', empat: '4', lima: '5', enam: '6', tujuh: '7', delapan: '8', sembilan: '9', sepuluh: '10', setengah: '0,5' }
  question = question.replace(/\bsejuta\b/gi, '1 juta').replace(/\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|setengah)\s+(juta|ribu)\b/gi, (_m, word: string, suffix: string) => words[word.toLowerCase()] + ' ' + suffix)
  const match = question.match(/(?:anggaran|budget|bujet|modal|dana)(?:nya)?\s*(?:sebesar|sekitar|jadi|menjadi|hanya|cuma|:|=)?\s*(?:rp\.?\s*)?(\d[\d.,]*)\s*(juta|jt|ribu|rb|miliar)?/i) || (allowBareMoney ? question.match(/(?:rp\.?\s*)?(\d[\d.,]*)\s*(juta|jt|ribu|rb|miliar)\b/i) : null)
  if (!match) return fallback
  let amount = match[1]
  const suffix = match[2]?.toLowerCase()
  if (suffix) amount = amount.replace(',', '.')
  else amount = amount.replace(/[.,](?=\d{3}(?:[.,]|$))/g, '').replace(',', '.')
  const multiplier = suffix === 'miliar' ? 1000000000 : ['juta', 'jt'].includes(suffix || '') ? 1000000 : ['ribu', 'rb'].includes(suffix || '') ? 1000 : 1
  const value = Number(amount) * multiplier
  return Number.isSafeInteger(value) && value > 0 && value <= 999999999999 ? value : fallback
}

export function validateChatDraft(value: unknown, context: AssistantContext, canClarify: boolean): ChatDraft {
  const draft = chatDraftSchema.parse(value)
  if (draft.basis === 'store_data' && !draft.factIds.length && !/[\p{N}]|\{\{/u.test(draft.message)) draft.basis = 'general'
  if (!canClarify && draft.mode === 'clarification') throw Error('Clarification already used')
  if (draft.mode === 'clarification' && (draft.items.length || draft.message.length > 700 || (draft.message.match(/[?？]/g) || []).length > 2)) throw Error('Too many clarification questions')
  if (draft.mode === 'answer' && /[?？]/.test(draft.message + draft.assumptions.join(' '))) throw Error('Answer must proceed without asking again')
  if (new Set(draft.factIds).size !== draft.factIds.length || draft.factIds.some(id => !context.facts.some(f => f.id === id))) throw Error('Unknown evidence')
  if (draft.basis === 'store_data' && !draft.factIds.length) throw Error('Store claims need evidence')
  const ids = [...draft.message.matchAll(/\{\{fact:([a-z0-9_]+)\}\}/g)].map(m => m[1])
  if (ids.some(id => !draft.factIds.includes(id))) throw Error('Uncited evidence placeholder')
  if (/\{\{|\}\}/.test(draft.message.replace(/\{\{fact:[a-z0-9_]+\}\}/g, ''))) throw Error('Malformed evidence placeholder')
  if (draft.basis === 'store_data' && /[\p{N}]|\b(?:rp|rupiah|juta|ribu|miliar|persen)\b|%/iu.test(draft.message.replace(/\{\{fact:[a-z0-9_]+\}\}/g, ''))) throw Error('Store numbers must use verified evidence placeholders')
  if (draft.items.length && draft.basis !== 'estimate') throw Error('Plans must be labelled estimates')
  return draft
}

export function renderChatAnswer(draft: ChatDraft, context: AssistantContext, budget: number | null, dataWarning?: string): ChatAnswer {
  let estimate: Estimate | null = null
  if (draft.items.length) {
    const cost = (price: number, scaledQuantity: bigint) => (BigInt(price) * scaledQuantity + BigInt(500)) / BigInt(1000)
    const originalTotal = draft.items.reduce((sum, item) => sum + cost(item.unitCost, BigInt(Math.round(item.quantity * 1000))), BigInt(0))
    const adjusted = budget !== null && originalTotal > BigInt(budget)
    let remaining = budget === null ? null : BigInt(budget)
    const items: Estimate['items'] = []
    for (const item of draft.items) {
      let scaled = BigInt(Math.round(item.quantity * 1000))
      if (adjusted && item.unitCost > 0) {
        const step = /^(kg|kilogram|g|gram|l|liter|litre|ml|m|meter)$/i.test(item.unit.trim()) || !Number.isInteger(item.quantity) ? BigInt(1) : BigInt(1000)
        scaled = scaled * BigInt(budget!) / originalTotal / step * step
        const affordable = (remaining! * BigInt(1000) + BigInt(499)) / BigInt(item.unitCost) / step * step
        if (scaled > affordable) scaled = affordable
      }
      if (!scaled) continue
      const total = cost(item.unitCost, scaled)
      items.push({ ...item, quantity: Number(scaled) / 1000, total: total.toString() })
      if (remaining !== null) remaining -= total
    }
    const total = items.reduce((sum, item) => sum + BigInt(item.total), BigInt(0))
    estimate = { items, total: total.toString(), budget: budget === null ? null : String(budget), remaining: remaining?.toString() ?? null, adjusted, originalTotal: originalTotal.toString(), removedItems: draft.items.length - items.length }
  }
  const used = new Set<string>()
  const message = draft.message.replace(/\{\{fact:([a-z0-9_]+)\}\}/g, (_match, id: string) => { used.add(id); return context.facts.find(f => f.id === id)!.text })
  const facts = draft.factIds.filter(id => !used.has(id)).map(id => context.facts.find(f => f.id === id)!.text)
  const sources = [...new Set(draft.factIds.map(id => /^(stock_|empty_stock)/.test(id) ? 'Inventori saat ini' : 'Laporan penjualan periode pilihan'))]
  return { title: '', message, mode: draft.mode, basis: draft.basis, assumptions: draft.assumptions, estimate, facts, suggestions: [], from: context.filter.from, to: context.filter.to, generatedAt: context.generatedAt, stockAt: context.stockAt, sources, dataWarning }
}

export const chatMoney = (value: string) => reportMoney(BigInt(value))
