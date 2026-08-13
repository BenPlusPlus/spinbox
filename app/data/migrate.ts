import { ConfigError, loadConfig } from '../modules/config/index.ts'
import { openDatabase } from './index.ts'

try {
  let config = loadConfig()
  let database = await openDatabase(config)
  console.log(`SQLite ready at ${database.path}`)
  database.close()
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message)
  } else {
    console.error(error)
  }
  process.exit(1)
}