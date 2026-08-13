import { form, get, route } from 'remix/routes'

export const routes = route({
  assets: get('/assets/*path'),
  home: '/',
  setup: form('/setup'),
  login: form('/login'),
  logout: { method: 'POST', pattern: '/logout' },
  invites: form('/invites'),
  inviteRevoke: { method: 'POST', pattern: '/invites/:id/revoke' },
  join: form('/join/:token'),
})
