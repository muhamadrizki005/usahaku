import { cn } from '@/lib/utils'

export function UsahakuLogo({
  showWordmark = true,
  className,
  wordmarkClassName,
}: {
  dark?: boolean
  neutral?: boolean
  showWordmark?: boolean
  className?: string
  wordmarkClassName?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <img src="/brand/usahaku-logo.png" alt={showWordmark ? '' : 'Usahaku'} width={36} height={36} className="size-[34px] shrink-0 object-contain" />
      {showWordmark && (
        <span className={cn('text-[17px] font-bold tracking-tight text-white leading-none translate-y-[0.5px]', wordmarkClassName)}>
          Usahaku
        </span>
      )}
    </span>
  )
}
