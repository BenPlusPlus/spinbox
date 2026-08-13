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
  settings: form('/settings'),
  memberPromote: { method: 'POST', pattern: '/settings/members/:id/promote' },
  memberDemote: { method: 'POST', pattern: '/settings/members/:id/demote' },
  memberDisable: { method: 'POST', pattern: '/settings/members/:id/disable' },
  memberEnable: { method: 'POST', pattern: '/settings/members/:id/enable' },
  memberHardDelete: { method: 'POST', pattern: '/settings/members/:id/hard-delete' },
  memberTemporaryPassword: { method: 'POST', pattern: '/settings/members/:id/temporary-password' },
  scanNow: { method: 'POST', pattern: '/settings/scan' },
  session: { method: 'POST', pattern: '/session' },
  mediaTrack: get('/media/tracks/:trackId'),
})
