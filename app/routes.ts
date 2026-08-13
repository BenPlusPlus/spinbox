import { form, get, route } from 'remix/routes'

export const routes = route({
  assets: get('/assets/*path'),
  home: '/',
  setup: form('/setup'),
  login: form('/login'),
  logout: { method: 'POST', pattern: '/logout' },
})
