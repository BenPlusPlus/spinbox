import { ConfigError, loadConfig } from '../config/index.ts'
import { openDatabase } from '../../data/index.ts'
import { AuthError, recoverLastAdmin } from './index.ts'

function readFlag(args: string[], name: string): string | undefined {
  let index = args.indexOf(name)
  if (index === -1) {
    return undefined
  }
  return args[index + 1]
}

let args = process.argv.slice(2)
let email = readFlag(args, '--email')
let password = readFlag(args, '--password')

if (!email || !password) {
  console.error('Usage: pnpm recover-admin --email <email> --password <new-password>')
  console.error('Host-local last-Admin recovery. Not a network endpoint.')
  process.exit(1)
}

try {
  let config = loadConfig()
  let database = await openDatabase(config)
  try {
    let member = await recoverLastAdmin(database, { email, password })
    console.log(`Recovered Admin ${member.email}. Sign in with the new password.`)
  } finally {
    database.close()
  }
} catch (error) {
  if (error instanceof ConfigError || error instanceof AuthError) {
    console.error(error.message)
  } else {
    console.error(error)
  }
  process.exit(1)
}
