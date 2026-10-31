'use client'
// Atlas Logistics shell in Next: shadcn's sidebar (collapsible to icons, a sheet on small screens, Cmd/Ctrl+B),
// a skip link, the search palette on Cmd/Ctrl+K, the theme switch in the footer, sonner for toasts.
import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Package, PlusSquare, Search, Settings, Truck } from 'lucide-react'
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeToggle } from '@/app/design/theme-toggle'
import { DATASET, STATUS_LABEL } from '@/lib/ui/saas/data'
import { PreferencesProvider, ShipmentsProvider, usePreferences } from './shipments-provider'

const NAV = [
  { label: 'Dashboard', href: '/app', icon: LayoutDashboard, exact: true },
  { label: 'Shipments', href: '/app/shipments', icon: Package, exact: true },
  { label: 'New shipment', href: '/app/shipments/new', icon: PlusSquare, exact: true },
  { label: 'Fleet', href: '/app/fleet', icon: Truck, exact: true },
  { label: 'Settings', href: '/app/settings', icon: Settings, exact: true },
]

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { theme, setTheme } = usePreferences()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const go = (href: string) => { setOpen(false); router.push(href) }
  return (
    <SidebarProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-popover focus:px-3 focus:py-2 focus:text-foreground">Skip to content</a>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link href="/app" className="flex min-w-0 items-center gap-2 px-1 font-semibold tracking-tight">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-sm bg-primary text-xs font-bold text-primary-foreground" aria-hidden="true">A</span>
            <span className="truncate group-data-[collapsible=icon]:sr-only">Atlas Logistics</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu aria-label="Application">
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => setOpen(true)} tooltip="Search (⌘K)"><Search aria-hidden="true" /><span>Search</span></SidebarMenuButton>
                </SidebarMenuItem>
                {NAV.map((item) => {
                  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link href={item.href} aria-current={active ? 'page' : undefined}><item.icon aria-hidden="true" /><span>{item.label}</span></Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">Dispatch · Bilbao</span>
            <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
          </div>
        </SidebarFooter>
      </Sidebar>
      {/* SidebarInset is the <main> landmark (one per page): it carries the skip target and the route-change focus */}
      <SidebarInset id="main" tabIndex={-1} className="min-w-0 outline-none">
        <header className="flex h-12 items-center gap-2 border-b border-border px-3">
          <SidebarTrigger aria-label="Toggle sidebar" data-sidebar-toggle />
          <span className="text-sm text-muted-foreground">Atlas Logistics</span>
        </header>
        {children}
      </SidebarInset>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Shipments and pages">
        <CommandInput placeholder="Search shipments, pages…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Pages">
            {NAV.map((item) => <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}><item.icon aria-hidden="true" />{item.label}</CommandItem>)}
          </CommandGroup>
          <CommandGroup heading="Shipments">
            {DATASET.shipments.slice(0, 60).map((s) => <CommandItem key={s.id} value={`${s.reference} ${s.customer} ${s.lane}`} onSelect={() => go(`/app/shipments?q=${s.reference}`)}><Package aria-hidden="true" />{s.reference} · {s.customer}<span className="ml-auto text-xs text-muted-foreground">{s.lane} · {STATUS_LABEL[s.status]}</span></CommandItem>)}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <Toaster position="bottom-right" richColors closeButton />
    </SidebarProvider>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider>
      <ShipmentsProvider>
        <TooltipProvider>
          <Shell>{children}</Shell>
        </TooltipProvider>
      </ShipmentsProvider>
    </PreferencesProvider>
  )
}
