import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all duration-150 outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'border-0 bg-primary text-primary-foreground hover:bg-[#132C9E] [a]:hover:bg-[#132C9E] rounded-xl',
        outline:
          'border-border bg-background hover:border-[#24CBC5] hover:bg-[#24CBC5]/10 hover:text-[#24CBC5] aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary:
          'border-0 bg-[#303640] text-[#E5E9F0] hover:bg-[#3D4653] hover:text-white active:scale-[0.98] rounded-xl aria-expanded:bg-[#3D4653]',
        action:
          'border-0 bg-[#24CBC5]/15 text-[#24CBC5] hover:bg-[#24CBC5]/25 hover:text-white active:scale-[0.97] rounded-full font-semibold focus-visible:ring-2 focus-visible:ring-[#24CBC5]/60',
        actionMuted:
          'border-0 bg-[#1C222E] text-[#C5CBD5] hover:bg-[#303640] hover:text-white active:scale-[0.97] rounded-full font-semibold focus-visible:ring-2 focus-visible:ring-white/20',
        subtle:
          'border-0 bg-[#303640] text-[#C5CBD5] hover:bg-[#3D4653] hover:text-white active:scale-[0.98] rounded-xl font-medium focus-visible:ring-2 focus-visible:ring-[#1835D9]/40',
        ghost:
          'border-0 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
        destructive:
          'border-0 bg-destructive/10 text-destructive hover:bg-[#4A252B] hover:text-[#FFB4AE] focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40 rounded-xl',
        link: 'border-0 text-accent underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5',
        action: 'h-auto py-1.5 px-3 text-xs gap-1.5',
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5',
        icon: 'size-8',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
