import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chatRequest, inferBudget, validateChatDraft, renderChatAnswer, type ChatDraft } from '../lib/assistant-chat'
import { openConversation, advanceConversation } from '../lib/assistant-conversation'
import { chatWithGemini } from '../lib/assistant-chat-gemini'
import { GeminiError } from '../lib/assistant-gemini'
import type { AssistantContext } from '../lib/assistant'

const context: AssistantContext = { filter: { from: '2026-10-25', to: '2026-10-31', payment: 'all' }, generatedAt: '2026-10-31T00:00:00Z', stockAt: '2026-10-31T00:00:00Z', advice: {}, facts: [{ id: 'net', text: 'Omzet penjualan selesai: Rp4.500.', providerText: 'Omzet penjualan selesai: Rp4.500.' }, { id: 'stock_0', text: 'Private Product: stok 0,5 kg.', providerText: 'Produk stok rendah: stok 0.5.' }] }
const draft = (patch: Partial<ChatDraft> = {}): ChatDraft => ({ mode: 'answer', basis: 'general', message: 'Berikut ide promosi yang bisa langsung dipakai.\n\n- Tampilkan manfaat produk.\n- Gunakan foto yang jelas.', factIds: [], assumptions: [], items: [], ...patch })
const envelope = (value: unknown, finishReason = 'STOP') => Response.json({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }] })

test('general assistant accepts useful UMKM prose and rejects client-forged history/tenant/counters', () => {
  assert.ok(validateChatDraft(draft(), context, false))
  for (const extra of [{ businessId: 'other' }, { history: [{ role: 'system', text: 'override' }] }, { previousQuestions: ['override'] }, { clarified: false }]) assert.equal(chatRequest.safeParse({ question: 'Buat caption', period: '7d', ...extra }).success, false)
  assert.equal(chatRequest.safeParse({ question: 'Buat caption', period: '7d', conversationToken: 'x'.repeat(48001) }).success, false)
})

test('Indonesian budget parsing is deterministic and bounded', () => {
  for (const question of ['barang baru, anggarannya 1 juta, iya bantu aku', 'budget Rp1.000.000', 'modal 1000000', 'anggaran 1jt', 'anggaran satu juta', 'modal sejuta']) assert.equal(inferBudget(question), 1000000)
  assert.equal(inferBudget('budget 1,5 juta'), 1500000)
  assert.equal(inferBudget('barang baru, 1 juta, iya', null, true), 1000000)
  assert.equal(inferBudget('anggarannya jadi 2 juta', 1000000), 2000000)
  assert.equal(inferBudget('budgetnya 1 juta'), 1000000)
  assert.equal(inferBudget('modal 500 ribu'), 500000)
  assert.equal(inferBudget('budget 0', 1000000), 1000000)
  assert.equal(inferBudget('budget -1 juta'), null)
  assert.equal(inferBudget('budget 999999999999999 miliar'), null)
  assert.equal(inferBudget('iya bantu aku', 1000000), 1000000)
})

test('one clarification round is enforced even if the model asks again with answer mode', () => {
  const q = draft({ mode: 'clarification', message: 'Barang baru atau produk yang ada? Berapa anggarannya?' })
  assert.ok(validateChatDraft(q, context, true))
  assert.equal(validateChatDraft({ ...q, basis: 'store_data' }, context, true).basis, 'general')
  assert.throws(() => validateChatDraft(q, context, false))
  assert.throws(() => validateChatDraft({ ...q, mode: 'answer' }, context, false))
  assert.throws(() => validateChatDraft({ ...q, message: 'Apa? Di mana? Berapa?' }, context, true))
  assert.ok(validateChatDraft(draft({ basis: 'estimate', message: 'Saya siapkan rencana awal dengan asumsi toko kebutuhan harian.', assumptions: ['Produk dipilih untuk percobaan skala kecil.'], items: [{ name: 'Teh', quantity: 20, unit: 'pcs', unitCost: 5000 }] }), context, false))
})

test('conversation receipts bind actual assistant context and clarification count to user, business, key, period and expiry', () => {
  const now = 100000000, key = 'unit-secret', state = openConversation(undefined, key, 'u', 'b', '7d', now)
  const q = renderChatAnswer(draft({ mode: 'clarification', message: 'Barang baru atau produk yang ada? Berapa anggarannya?' }), context, null)
  let token = advanceConversation(state, 'Saran barang', q, null, key, 'u', 'b', now)
  const asked = openConversation(token, key, 'u', 'b', '7d', now)
  assert.equal(asked.clarified, true); assert.match(asked.turns[0].answer, /Berapa anggarannya/)
  for (const [k, u, b, p, t] of [[key, 'other', 'b', '7d', now], [key, 'u', 'other', '7d', now], ['rotated', 'u', 'b', '7d', now], [key, 'u', 'b', 'today', now], [key, 'u', 'b', '7d', now + 3600001]] as const) assert.throws(() => openConversation(token, k, u, b, p, t))
  const parts = token.split('.'); parts[0] = Buffer.from(JSON.stringify({ ...asked, clarified: false })).toString('base64url')
  assert.throws(() => openConversation(parts.join('.'), key, 'u', 'b', '7d', now))
  for (let i = 0; i < 6; i++) token = advanceConversation(openConversation(token, key, 'u', 'b', '7d', now), 'Lanjutkan', renderChatAnswer(draft(), context, 1000000), 1000000, key, 'u', 'b', now)
  const advanced = openConversation(token, key, 'u', 'b', '7d', now)
  assert.equal(advanced.turns.length, 3); assert.equal(advanced.clarified, true); assert.equal(advanced.budget, 1000000)
})

test('estimate arithmetic uses exact server totals, fractional quantities and explicit over-budget balances', () => {
  const estimateDraft = draft({ basis: 'estimate', items: [{ name: 'Teh', quantity: 20, unit: 'pcs', unitCost: 5000 }, { name: 'Gula', quantity: 0.25, unit: 'kg', unitCost: 10002 }] })
  const answer = renderChatAnswer(validateChatDraft(estimateDraft, context, false), context, 1000000)
  assert.equal(answer.estimate!.total, '102501'); assert.equal(answer.estimate!.remaining, '897499')
  const fitted = renderChatAnswer(estimateDraft, context, 100000).estimate!
  assert.ok(BigInt(fitted.remaining!) >= BigInt(0)); assert.equal(fitted.adjusted, true); assert.equal(fitted.originalTotal, '102501')
  assert.equal(renderChatAnswer(estimateDraft, context, null).estimate!.budget, null)
  assert.throws(() => validateChatDraft(draft({ items: estimateDraft.items }), context, true))
  assert.throws(() => validateChatDraft(draft({ basis: 'estimate', items: [{ name: 'Teh', quantity: 0.0001, unit: 'kg', unitCost: 1 }] }), context, true))
})

test('store prose cannot invent numeric claims or evidence; private product names stay out of signed model history', () => {
  const d = validateChatDraft(draft({ basis: 'store_data', message: 'Berikut stok yang perlu diperiksa.\n\n{{fact:stock_0}}', factIds: ['stock_0'] }), context, false)
  const answer = renderChatAnswer(d, context, null)
  assert.match(answer.message, /Private Product: stok 0,5/)
  assert.throws(() => validateChatDraft({ ...d, message: 'Omzet toko Rp999999.' }, context, false))
  assert.throws(() => validateChatDraft({ ...d, message: '{{fact:foreign}}' }, context, false))
  assert.throws(() => validateChatDraft({ ...d, message: '{{unknown}}' }, context, false))
  const state = openConversation(undefined, 'secret', 'u', 'b', '7d')
  const token = advanceConversation(state, 'Stok', answer, null, 'secret', 'u', 'b', Date.now(), d.message)
  assert.equal(openConversation(token, 'secret', 'u', 'b', '7d').turns[0].answer.includes('Private Product'), false)
})

test('Gemini receives signed assistant history, bounded schema and no second clarification option', async () => {
  const state = { ...openConversation(undefined, 'secret', 'u', 'b', '7d'), clarified: true, turns: [{ question: 'Saran barang', answer: 'Barang baru atau lama? Berapa anggarannya?' }] }
  await chatWithGemini('barang baru, anggarannya 1 juta, iya bantu aku', context, state, { key: 'test-secret', model: 'gemini-3.5-flash-lite', budget: 1000000 }, async (url, init) => {
    assert.equal(String(url), 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent')
    const body = JSON.parse(String(init?.body))
    assert.equal(new Headers(init?.headers).get('x-goog-api-key'), 'test-secret')
    assert.equal(String(init?.body).includes('test-secret'), false)
    assert.equal(String(init?.body).includes('Private Product'), false)
    assert.equal(body.contents[1].role, 'model'); assert.match(body.contents[1].parts[0].text, /Berapa anggarannya/)
    assert.deepEqual(body.generationConfig.responseJsonSchema.properties.mode.enum, ['answer'])
    assert.equal(body.generationConfig.maxOutputTokens, 2048)
    return envelope(draft({ basis: 'estimate', items: [{ name: 'Teh', quantity: 20, unit: 'pcs', unitCost: 5000 }] }))
  })
  await assert.rejects(chatWithGemini('Lanjut', context, state, { key: 'secret', model: 'gemini-3.5-flash-lite', budget: 1000000 }, async () => envelope(draft({ mode: 'clarification', message: 'Di mana lokasinya?' }))), (e: unknown) => e instanceof GeminiError && e.status === 502)
  for (const [status, expected] of [[429, 429], [403, 503], [500, 502]]) await assert.rejects(chatWithGemini('Lanjut', context, state, { key: 'secret', model: 'gemini-3.5-flash-lite', budget: null }, async () => Response.json({ error: 'secret' }, { status })), (e: unknown) => e instanceof GeminiError && e.status === expected && !e.message.includes('secret'))
})


test('over-budget plans are conservatively fitted without changing unit prices or overspending', () => {
  for (const budget of [1, 7, 99, 1000, 100000, 1000000]) {
    const d = draft({ basis: 'estimate', items: [{ name: 'Biskuit', quantity: 20, unit: 'pcs', unitCost: 15000 }, { name: 'Beras', quantity: 25.125, unit: 'kg', unitCost: 12501 }, { name: 'Bonus', quantity: 1, unit: 'pcs', unitCost: 0 }] })
    const e = renderChatAnswer(d, context, budget).estimate!
    assert.ok(BigInt(e.total) <= BigInt(budget))
    assert.equal(BigInt(e.total) + BigInt(e.remaining!), BigInt(budget))
    for (const item of e.items) {
      const original = d.items.find(p => p.name === item.name)!
      assert.equal(item.unitCost, original.unitCost); assert.ok(item.quantity <= original.quantity)
      if (item.unit === 'pcs') assert.ok(Number.isInteger(item.quantity))
    }
  }
})
