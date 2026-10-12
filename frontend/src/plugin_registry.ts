import type { RouteObject } from 'react-router-dom'

// Each plugin ships `frontend/index.tsx` exporting `routes` (possibly []).
// The four globs cover host checkout, Docker WORKDIR, and /plugins mount so
// plugin UI resolves in every deployment without naming any plugin here.
const modules = {
  ...import.meta.glob('../../plugins/*/frontend/index.{tsx,ts,jsx,js}'),
  ...import.meta.glob('../plugins/*/frontend/index.{tsx,ts,jsx,js}'),
  ...import.meta.glob('/app/plugins/*/frontend/index.{tsx,ts,jsx,js}'),
  ...import.meta.glob('/plugins/*/frontend/index.{tsx,ts,jsx,js}'),
} as Record<string, () => Promise<{ routes?: RouteObject[] }>>

export async function loadPluginRoutes(): Promise<RouteObject[]> {
  const out: RouteObject[] = []
  for (const load of Object.values(modules)) {
    try {
      const mod = await load()
      if (Array.isArray(mod.routes)) out.push(...mod.routes)
    } catch (e) {
      console.error('plugin UI failed to load, skipped', e)
    }
  }
  return out
}
