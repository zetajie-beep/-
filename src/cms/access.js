const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

// Only the unconfigured local preview may bypass cloud authentication.
// Online editor routing is separate; production always requires Supabase Auth.
export function canUseLocalEditor({
  development = import.meta.env?.DEV === true,
  hostname = globalThis.location?.hostname ?? '',
} = {}) {
  return development === true && LOOPBACK_HOSTS.has(hostname)
}

export function isEditorRoute({ pathname = '', search = '' } = {}) {
  return pathname.replace(/\/+$/, '') === '/studio'
    || new URLSearchParams(search).get('studio') === '1'
}
