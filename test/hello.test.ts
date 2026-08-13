import { describe, it } from 'node:test'
import * as assert from 'remix/assert'

import { router } from '../app/router.ts'
import { routes } from '../app/routes.ts'

describe('hello route', () => {
  it('serves the smoke hello page', async () => {
    let response = await router.fetch(new Request('http://localhost' + routes.home.href()))

    assert.equal(response.status, 200)
    assert.match(await response.text(), /Hello from Spinbox/)
  })
})
