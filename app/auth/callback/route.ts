import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { allowRecovery } from '@/lib/auth/recovery'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const requestedNext = searchParams.get('next') ?? '/dashboard'
  const next = ['/dashboard', '/onboarding', '/account/reset-password'].includes(requestedNext) ? requestedNext : '/dashboard'
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (code || (tokenHash && (type === 'signup' || type === 'recovery' || type === 'email'))) {
    const supabase = await createClient()
    const { data, error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type as 'signup' | 'recovery' | 'email' })

    if (!error && data.user) {
      if (next === '/account/reset-password' || type === 'recovery') {
        if (data.user.app_metadata.account_type === 'staff') return NextResponse.redirect(`${origin}/account`)
        await allowRecovery(data.user.id)
        return NextResponse.redirect(`${origin}/account/reset-password`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
