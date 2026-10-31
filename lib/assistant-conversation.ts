import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { ChatAnswer } from './assistant-chat'

const stateSchema = z.object({
  version: z.literal(1), expires: z.number().int(), period: z.enum(['today', '7d', '30d']),
  clarified: z.boolean(), budget: z.number().int().positive().max(999999999999).nullable(),
  lastMode: z.enum(['answer', 'clarification']).default('answer'),
  turns: z.array(z.object({ question: z.string().max(600), answer: z.string().max(2400) }).strict()).max(3),
}).strict()
export type Conversation = z.infer<typeof stateSchema>
export class ConversationError extends Error {}
function signingKey(key: string, userId: string, businessId: string) {
  return createHmac('sha256', key).update('usahaku-assistant-chat-v1\0' + userId + '\0' + businessId).digest()
}
export function openConversation(token: string | undefined, key: string, userId: string, businessId: string, period: Conversation['period'], now = Date.now()): Conversation {
  if (!token) return { version: 1, expires: now + 3600000, period, clarified: false, budget: null, lastMode: 'answer', turns: [] }
  try {
    if (token.length > 48000) throw Error('Token too long')
    const [body, signature, extra] = token.split('.')
    if (!body || !signature || extra !== undefined) throw Error('Malformed token')
    const expected = createHmac('sha256', signingKey(key, userId, businessId)).update(body).digest(), actual = Buffer.from(signature, 'base64url')
    if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) throw Error('Invalid signature')
    const state = stateSchema.parse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')))
    if (state.expires < now || state.expires > now + 3600000 || state.period !== period) throw Error('Expired or wrong period')
    return state
  } catch { throw new ConversationError('Konteks percakapan tidak berlaku. Pilih Percakapan baru untuk melanjutkan.') }
}
export function advanceConversation(state: Conversation, question: string, answer: ChatAnswer, budget: number | null, key: string, userId: string, businessId: string, now = Date.now(), modelMessage = answer.message) {
  const summary = [answer.estimate ? 'Rencana perkiraan: ' + JSON.stringify(answer.estimate) : '', modelMessage, ...answer.assumptions].filter(Boolean).join('\n').slice(0, 2400)
  const next: Conversation = { ...state, expires: now + 3600000, clarified: state.clarified || answer.mode === 'clarification', lastMode: answer.mode, budget, turns: [...state.turns.slice(-2), { question, answer: summary }] }
  const body = Buffer.from(JSON.stringify(next)).toString('base64url')
  const signature = createHmac('sha256', signingKey(key, userId, businessId)).update(body).digest('base64url')
  return `${body}.${signature}`
}
