import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { useAuth } from './auth'

export interface MenuItem {
  label: string
  path: string
  permission?: string | null
}

const CORE_LINKS: { to: string; label: string; perm: string }[] = [
  { to: '/users', label: 'Users', perm: 'core.user.view' },
  { to: '/roles', label: 'Roles', perm: 'core.role.view' },
  { to: '/departments', label: 'Departments', perm: 'core.department.view' },
  { to: '/positions', label: 'Positions', perm: 'core.position.view' },
  { to: '/audit', label: 'Audit', perm: 'core.audit.view' },
]

export function Layout() {
  const { me, logout, can } = useAuth()
  const nav = useNavigate()
  const menu = useQuery({
    queryKey: ['menu'],
    queryFn: () => api<MenuItem[]>('/api/v1/core/menu'),
  })

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <nav style={{ width: 220, background: '#1e293b', color: '#fff', padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Account Registry</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 16 }}>{me?.username}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {CORE_LINKS.filter((l) => can(l.perm)).map((l) => (
            <Link key={l.to} to={l.to} style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              {l.label}
            </Link>
          ))}
          {(menu.data ?? []).map((m) => (
            <Link key={m.path} to={m.path} style={{ color: '#93c5fd', textDecoration: 'none' }}>
              {m.label}
            </Link>
          ))}
        </div>
        <button
          onClick={() => {
            logout()
            nav('/login')
          }}
          style={{ marginTop: 24 }}
        >
          Logout
        </button>
      </nav>
      <main style={{ flex: 1, padding: 24, maxWidth: 1100 }}>
        <Outlet />
      </main>
    </div>
  )
}
