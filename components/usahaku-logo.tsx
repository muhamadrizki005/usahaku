export function UsahakuLogo({ showWordmark = true }: { dark?: boolean; neutral?: boolean; showWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <img src="/brand/usahaku-logo.png" alt={showWordmark ? '' : 'Usahaku'} width={36} height={36} className="size-9 shrink-0 object-contain" />
      {showWordmark && <span className="font-semibold tracking-tight">usahaku</span>}
    </span>
  )
}
