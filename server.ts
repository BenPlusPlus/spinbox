import * as http from 'node:http'
import { createRequestListener } from 'remix/node-fetch-server'

import { openDatabase, type AppDatabase } from './app/data/index.ts'
import { ConfigError, loadConfig, type AppConfig } from './app/modules/config/index.ts'
import { router } from './app/router.ts'

let config: AppConfig
let database: AppDatabase
try {
  config = loadConfig()
  database = await openDatabase(config)
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message)
  } else {
    console.error(error)
  }
  process.exit(1)
}

const server = http.createServer(
  createRequestListener(async (request) => {
    try {
      return await router.fetch(request)
    } catch (error) {
      if (!(request.signal.aborted && error === request.signal.reason)) {
        console.error(error)
      }
      return new Response('Internal Server Error', { status: 500 })
    }
  }),
)

server.listen(config.port, '127.0.0.1', () => {
  console.log(
    `Server listening on http://127.0.0.1:${config.port} (origin ${config.publicUrl.origin})`,
  )
})

let shuttingDown = false

function shutdown() {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  database.close()
  server.close(() => process.exit(0))
  server.closeAllConnections()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
