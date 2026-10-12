import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from './api'

export interface Me {
  id: number
  username: string
  email: string
  is_active: boolean
  roles: { id: number; name: string }[]
  permissions: string[]
}

interface AuthCtx {
  me: Me | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  can: (perm: string) => boolean
}

const Ctx = createContext<AuthCtx>({
  me: null,
  loading: true,
  login: async () => {},
  logout: () => {},
  can: () => false,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(!!localStorage.getItem('access_token'))

  useEffect(() => {
    if (!localStorage.getItem('access_token')) return
    api<Me>('/api/v1/core/auth/me')
      .then(setMe)
      .catch(() => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const pair = await api<{ access_token: string; refresh_token: string }>(
      '/api/v1/core/auth/login',
      { method: 'POST', body: JSON.stringify({ username, password }) },
    )
    localStorage.setItem('access_token', pair.access_token)
    localStorage.setItem('refresh_token', pair.refresh_token)
    setMe(await api<Me>('/api/v1/core/auth/me'))
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setMe(null)
    window.location.href = '/login'
  }, [])

  const can = useCallback(
    (perm: string) => !!me && (me.permissions.includes('*') || me.permissions.includes(perm)),
    [me],
  )

  return <Ctx.Provider value={{ me, loading, login, logout, can }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
