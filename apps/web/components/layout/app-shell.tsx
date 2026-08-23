'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  Bot,
  Bell,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronsLeftRightEllipsis,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings2,
  Shield,
  Upload,
  WalletCards,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCompanyProfile } from '@/lib/api/hooks';
import { resolveCompanyBrandName, resolveCompanyLogo, resolveCompanyTagline } from '@/lib/company-brand';
import { useSession } from '@/components/providers/session-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const sidebarMetrics = [
  { label: 'SLA de respuesta', value: '4.2 h' },
  { label: 'Margen estimado', value: '27%' },
];

const navigation = [
  { href: '/kanban', label: 'Pipeline', icon: KanbanSquare, hint: 'Cotizaciones y seguimiento' },
  { href: '/dashboard', label: 'Forecast', icon: LayoutDashboard, hint: 'KPIs y revenue' },
  {
    href: '/ai-assistant',
    label: 'Asistente Inteligente',
    icon: Bot,
    hint: 'Aprendizaje híbrido para cotizaciones',
    children: [
      { href: '/ai-assistant', label: 'Sugerencias' },
      { href: '/ai-assistant/projects', label: 'Proyectos IA' },
      { href: '/ai-assistant/learning', label: 'Aprendizaje' },
    ],
  },
  { href: '/quotations', label: 'Cotizaciones', icon: WalletCards, hint: 'Vista de tabla' },
  { href: '/clients', label: 'Clientes', icon: Building2, hint: 'Cuentas y contactos' },
  {
    href: '/catalog',
    label: 'Catálogo',
    icon: BookOpen,
    hint: 'Suministros, servicios y actividades',
    children: [
      { href: '/catalog', label: 'Suministros' },
      { href: '/catalog/services', label: 'Servicios' },
      { href: '/catalog/activities', label: 'Actividades' },
      { href: '/catalog/reusable-blocks', label: 'Bloques reutilizables' },
    ],
  },
  {
    href: '/settings',
    label: 'Configuración',
    icon: Settings2,
    hint: 'Moneda, visualización y empresa',
    children: [
      { href: '/settings', label: 'Visualización' },
      { href: '/settings/company', label: 'Mi empresa' },
    ],
  },
  { href: '/import', label: 'Importador', icon: Upload, hint: 'Excel y logs' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const companyProfileQuery = useCompanyProfile();
  const { user, signOut } = useSession();
  const canManageUsers = user.displayRole === 'ADMIN';
  const canManageOperationalData = user.displayRole !== 'VIEWER';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    '/catalog': pathname.startsWith('/catalog'),
    '/ai-assistant': pathname.startsWith('/ai-assistant'),
    '/settings': pathname.startsWith('/settings'),
  });
  const userInitials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
  const brandName = resolveCompanyBrandName(companyProfileQuery.data);
  const tagline = resolveCompanyTagline(companyProfileQuery.data);
  const logoUrl = resolveCompanyLogo(companyProfileQuery.data);

  const visibleNavigation = navigation.filter((item) => {
    if (canManageOperationalData) {
      return true;
    }

    return ['/kanban', '/dashboard', '/quotations', '/settings'].includes(item.href);
  });
  const navigationWithUsers = canManageUsers
    ? [
        ...visibleNavigation.slice(0, 5),
        { href: '/users', label: 'Usuarios', icon: Shield, hint: 'Roles y accesos' },
        ...visibleNavigation.slice(5),
      ]
    : visibleNavigation;

  function SidebarContent({ mobile = false }: { mobile?: boolean }) {
    return (
      <>
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white">
            <img
              src={logoUrl}
              alt={brandName}
              className="h-9 w-9 object-contain"
            />
          </div>
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.24em] text-[rgba(255,255,255,0.7)]">
              {brandName}
            </p>
            <h1 className="text-[9px] font-medium uppercase tracking-[0.28em] text-[rgba(255,255,255,0.52)]">
              {tagline}
            </h1>
          </div>
        </div>

        <nav className="mt-8 space-y-2">
          {navigationWithUsers.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const hasChildren = Boolean(item.children?.length);
            const expanded = expandedMenus[item.href] ?? active;
            return (
              <div key={item.href} className="space-y-2">
                <div
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition',
                    active ? 'bg-white text-[var(--color-secondary)]' : 'text-[rgba(255,255,255,0.78)] hover:bg-white/10 hover:text-white',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      router.push(item.href);
                      if (mobile) {
                        setSidebarOpen(false);
                      }
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <Icon className="h-4 w-4" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className={cn('text-xs', active ? 'text-slate-500' : 'text-[rgba(255,255,255,0.45)]')}>
                        {item.hint}
                      </p>
                    </div>
                  </button>
                  {hasChildren ? (
                    <button
                      type="button"
                      aria-label={expanded ? `Colapsar ${item.label}` : `Expandir ${item.label}`}
                      onClick={() =>
                        setExpandedMenus((current) => ({
                          ...current,
                          [item.href]: !expanded,
                        }))
                      }
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-xl transition',
                        active ? 'hover:bg-slate-100' : 'hover:bg-white/10',
                      )}
                    >
                      <ChevronDown className={cn('h-4 w-4 transition-transform', expanded ? 'rotate-0' : '-rotate-90')} />
                    </button>
                  ) : null}
                </div>

                {item.children && active && expanded ? (
                  <div className="ml-5 space-y-1 border-l border-white/10 pl-4">
                    {item.children.map((child) => {
                      const childActive = pathname === child.href;

                      return (
                        <button
                          key={child.href}
                          type="button"
                          onClick={() => {
                            router.push(child.href);
                            if (mobile) {
                              setSidebarOpen(false);
                            }
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition',
                            childActive
                              ? 'bg-white/12 text-white'
                              : 'text-[rgba(255,255,255,0.62)] hover:bg-white/8 hover:text-white',
                          )}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                          <span>{child.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

      </>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 bg-[rgba(15,23,42,0.4)] backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)}>
          <aside
            className="h-full w-[300px] rounded-r-[32px] border-r border-white/10 bg-[var(--color-secondary)] p-5 text-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <SidebarContent mobile />
          </aside>
        </div>
      ) : null}

      <div className="mx-auto flex min-h-screen max-w-[1680px] gap-4 p-3 md:p-4">
        {!desktopSidebarCollapsed ? (
          <aside className="hidden w-[290px] shrink-0 flex-col rounded-[32px] border border-[var(--color-border)] bg-[var(--color-secondary)] p-5 text-white shadow-[0_30px_80px_rgba(31,41,55,0.28)] lg:flex">
            <SidebarContent />
          </aside>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col rounded-[32px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_25px_60px_rgba(15,23,42,0.08)]">
          <header className="sticky top-0 z-20 flex flex-col gap-4 border-b border-[var(--color-border)] bg-[rgba(248,250,252,0.82)] px-4 py-4 backdrop-blur md:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-white lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <button
                onClick={() => setDesktopSidebarCollapsed((current) => !current)}
                className="hidden h-11 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-white px-3 text-sm font-medium text-[var(--color-text)] lg:inline-flex"
              >
                <ChevronsLeftRightEllipsis className="mr-2 h-4 w-4" />
                {desktopSidebarCollapsed ? 'Mostrar panel' : 'Ocultar panel'}
              </button>
              <div className="hidden items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white px-4 md:flex md:w-[360px]">
                <Search className="h-4 w-4 text-[var(--color-text-faint)]" />
                <Input
                  className="border-0 bg-transparent px-0 focus:border-0 focus:ring-0"
                  placeholder="Buscar cotizaciones, clientes o contactos"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="icon">
                <Bell className="h-4 w-4" />
              </Button>
              <Button variant="secondary">
                <ChevronsLeftRightEllipsis className="h-4 w-4" />
                Vistas
              </Button>
              <div className="hidden h-11 min-w-11 items-center justify-center rounded-2xl border border-[var(--color-primary)] bg-[rgba(249,115,22,0.1)] px-3 text-sm font-semibold text-[var(--color-primary)] lg:inline-flex">
                {userInitials || 'US'}
              </div>
              <Button variant="secondary" onClick={signOut}>
                <LogOut className="h-4 w-4" />
                Salir
              </Button>
            </div>
          </header>

          <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
