// Usage (from the project folder):   node tools/check-live-setup/check.mjs
// Reads VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from .env.local (or the environment). Read-only. Never prints the key.
import { readFileSync } from 'node:fs'
import { runChecks } from './checks.mjs'

function fromEnvFile(name) {
  try {
    const text = readFileSync('.env.local', 'utf8')
    const m = new RegExp(`^${name}=(.*)$`, 'm').exec(text)
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
  } catch { return '' }
}
const url = process.env.VITE_SUPABASE_URL || fromEnvFile('VITE_SUPABASE_URL')
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fromEnvFile('VITE_SUPABASE_PUBLISHABLE_KEY')
const rows = await runChecks({ url, key })
const w = Math.max(...rows.map((r) => r.check.length))
for (const r of rows) console.log(`${r.result.padEnd(8)} ${r.check.padEnd(w)}  ${r.detail}`)
process.exitCode = rows.at(-1).result === 'OK' ? 0 : 1
