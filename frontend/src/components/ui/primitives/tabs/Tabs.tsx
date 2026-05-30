import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/utils/cn'

const Tabs = TabsPrimitive.Root

function TabsList({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn('inline-flex h-10 items-center rounded-lg bg-slate-100 p-1', className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm',
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content ref={ref} className={cn('outline-none', className)} {...props} />
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
