import { createClient } from '@/lib/supabase/server'
import { assistantFilter } from '@/lib/assistant'
import { chatRequest, inferBudget, renderChatAnswer } from '@/lib/assistant-chat'
import { advanceConversation, ConversationError, openConversation } from '@/lib/assistant-conversation'
import { chatWithGemini } from '@/lib/assistant-chat-gemini'
import { assistantLimit, geminiConfig, readAssistantContext } from '@/lib/assistant-server'
import { GeminiError } from '@/lib/assistant-gemini'
import { ReportError } from '@/lib/reports-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' }
const fail = (error: string, status: number, retryAfter = 0) => Response.json({ error, retryAfter }, { status, headers: { ...headers, ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) } })

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return fail('Asal permintaan ditolak.', 403)
  if (!request.headers.get('content-type')?.startsWith('application/json')) return fail('Format permintaan tidak didukung.', 415)
  const client = await createClient()
  const { data: { user }, error: authError } = await client.auth.getUser()
  if (authError || !user) return fail('Silakan login kembali.', 401)
  const { data: member, error: memberError } = await client.from('business_members').select('business_id,role,active,must_change_password').eq('user_id', user.id).maybeSingle()
  if (memberError) return fail('Akses belum dapat diperiksa.', 502)
  if (!member?.active || member.must_change_password || !['owner', 'admin'].includes(member.role)) return fail('Asisten hanya tersedia untuk pemilik dan admin toko yang aktif.', 403)
  const { data: business, error: businessError } = await client.from('businesses').select('category,onboarding_completed_at').eq('id', member.business_id).single()
  if (businessError || !business) return fail('Usaha belum dapat diperiksa.', 502)
  if (business.category !== 'store' || !business.onboarding_completed_at) return fail('Selesaikan pengaturan toko sebelum memakai Asisten.', 403)
  const reader = request.body?.getReader()
  let body = '', size = 0
  try {
    if (!reader) return fail('Permintaan kosong.', 400)
    const decoder = new TextDecoder()
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 65536) { await reader.cancel(); return fail('Permintaan terlalu panjang.', 413) }
      body += decoder.decode(chunk.value, { stream: true })
    }
    body += decoder.decode()
  } catch { return fail('Permintaan belum dapat dibaca.', 400) }
  const parsed = chatRequest.safeParse((() => { try { return JSON.parse(body) } catch { return null } })())
  if (!parsed.success) return fail('Tulis pertanyaan 3–600 karakter dan pilih periode yang tersedia.', 400)
  const config = geminiConfig()
  if (!config.key) return fail('Gemini belum dikonfigurasi. Hubungi pengelola aplikasi.', 503)
  let conversation
  try { conversation = openConversation(parsed.data.conversationToken, config.key, user.id, member.business_id, parsed.data.period) }
  catch (e) { return fail(e instanceof ConversationError ? e.message : 'Konteks percakapan tidak berlaku.', 409) }
  const release = assistantLimit.acquire(member.business_id, user.id)
  if (!release) return fail('Batas permintaan sementara tercapai atau pertanyaan sebelumnya masih diproses. Coba lagi dalam satu menit.', 429, 60)
  try {
    let context, dataWarning: string | undefined
    try { context = await readAssistantContext(client, member.business_id, parsed.data.period) }
    catch (e) {
      if (e instanceof ReportError && e.status === 403) throw e
      dataWarning = 'Ringkasan data toko belum dapat dibaca. Jawaban ini tidak memakai angka toko yang terverifikasi.'
      const now = new Date().toISOString()
      context = { filter: assistantFilter(parsed.data.period), generatedAt: now, stockAt: now, facts: [], advice: {} }
    }
    const budget = inferBudget(parsed.data.question, conversation.budget, conversation.lastMode === 'clarification')
    const draft = await chatWithGemini(parsed.data.question, context, conversation, { ...config, budget, dataWarning })
    const answer = renderChatAnswer(draft, context, budget, dataWarning)
    const conversationToken = advanceConversation(conversation, parsed.data.question, answer, budget, config.key, user.id, member.business_id, Date.now(), draft.message)
    return Response.json({ answer, conversationToken }, { headers })
  } catch (e) {
    if (e instanceof GeminiError) return fail(e.message, e.status, e.retryAfter)
    if (e instanceof ReportError) return fail(e.message, e.status)
    return fail('Data usaha belum dapat dianalisis. Coba lagi; tidak ada data yang diubah.', 502)
  } finally { release() }
}
