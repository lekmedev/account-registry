import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { useAuth } from './auth'

export interface MenuItem {
  label: string
  path: string
  permission?: string | null
}

const CORE_LINKS: { to: string; label: string; perm?: string }[] = [
  { to: '/', label: 'Overview' },
  { to: '/users', label: 'Users', perm: 'core.user.view' },
  { to: '/roles', label: 'Roles', perm: 'core.role.view' },
  { to: '/departments', label: 'Departments', perm: 'core.department.view' },
  { to: '/positions', label: 'Positions', perm: 'core.position.view' },
  { to: '/audit', label: 'Audit log', perm: 'core.audit.view' },
]

/** Dark is the product default; "light" is only ever set by an explicit toggle. */
function useThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') || 'dark',
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('ui-theme', theme) } catch { /* private mode */ }
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  return { theme, toggle }
}

function initials(name: string) {
  return name.slice(0, 2)
}

export function Layout() {
  const { me, logout, can } = useAuth()
  const nav = useNavigate()
  const { theme, toggle } = useThemeToggle()

  const menu = useQuery({
    queryKey: ['menu'],
    queryFn: () => api<MenuItem[]>('/api/v1/core/menu'),
  })

  const plugins = (menu.data ?? []).filter((m) => can(m.permission ?? ''))

  return (
    <div className="app">
      <aside className="side">
        <div className="side__brand">
          <span className="side__mark" aria-hidden="true">AR</span>
          <div>
            <div className="side__name">Account Registry</div>
            <div className="side__ver">core v1.0.0</div>
          </div>
        </div>

        <nav className="side__group" aria-label="Core">
          <p className="side__label">Core</p>
          {CORE_LINKS.filter((l) => !l.perm || can(l.perm)).map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) => `navlink${isActive ? ' navlink--active' : ''}`}
            >
              <span className="navlink__dot" aria-hidden="true" />
              {l.label}
            </NavLink>
          ))}
        </nav>

        {/* Plugin entries come straight from the API — core names no plugin. */}
        {plugins.length > 0 && (
          <nav className="side__group" aria-label="Plugins">
            <p className="side__label">Plugins</p>
            {plugins.map((m) => (
              <NavLink
                key={m.path}
                to={m.path}
                className={({ isActive }) =>
                  `navlink navlink--plugin${isActive ? ' navlink--active' : ''}`
                }
              >
                <span className="navlink__dot" aria-hidden="true" />
                {m.label}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="side__foot">
          <div className="side__user">
            <span className="avatar" aria-hidden="true">{initials(me?.username ?? '?')}</span>
            <div className="side__userinfo">
              <div className="side__username">{me?.username}</div>
              <div className="side__roles">{me?.roles.map((r) => r.name).join(' · ') || 'no role'}</div>
            </div>
          </div>
          <div className="side__actions">
            <button
              type="button"
              className="iconbtn"
              onClick={toggle}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => { logout(); nav('/login') }}
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}

/** Shared page header so every core page looks the same. */
export function PageHead({ kicker, title, lead, children }: {
  kicker: string
  title: string
  lead?: string
  children?: React.ReactNode
}) {
  return (
    <div className="pagehead">
      <div>
        <p className="mono" style={{ color: 'var(--text-accent)' }}>{kicker}</p>
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
      {children}
    </div>
  )
}

/** Empty-state block for tables with no rows. */
export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <h3 className="empty__title">{title}</h3>
      {children && <p className="empty__text">{children}</p>}
    </div>
  )
}

/** Error banner. Error text comes straight from the API `detail` field. */
export function ErrorNote({ children }: { children: string }) {
  if (!children) return null
  return <div className="alert alert--err" role="alert">{children}</div>
}