'use client'
import { useState } from 'react'
import { businessInitials } from '@/lib/business-profile'
import type { Business } from '@/lib/validation'

// Only the contents of the existing avatar slot change; parent styles stay intact.
export function BusinessLogo({ business, className = 'size-full object-cover' }: { business: Business; className?: string }) {
  const src = business.logo_path ? `/api/business/${business.id}/logo?v=${business.profile_revision || 0}` : ''
  const [failed, setFailed] = useState('')
  return src && failed !== src ? <img src={src} alt={`Logo ${business.name}`} className={className} onError={() => setFailed(src)} /> : <>{businessInitials(business.name)}</>
}
