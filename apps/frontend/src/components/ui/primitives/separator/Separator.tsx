import * as React from 'react'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import { cn } from '@/utils/cn'

function Separator({
  className,
  decorative = true,
  orientation = 'horizontal',
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0 bg-slate-200 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
        className
      )}
      {...props}
    />
  )
}

export { Separator }
