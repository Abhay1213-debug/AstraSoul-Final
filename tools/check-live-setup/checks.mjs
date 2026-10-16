// READ-ONLY checks of a LIVE Supabase project using only the PUBLIC (publishable / anon) key - the same key every visitor's browser holds.
// It performs GET requests only. It creates nothing, changes nothing, signs nobody up, and never prints the key.
// What it can and cannot tell you is stated per row. It does not replace the owner's database post-check or the real-session tests.

const PROTECTED_TABLES = ['profiles', 'staff_members', 'consent_versions', 'consultation_requests', 'request_notes', 'payments', 'app_settings', 'audit_log']
const PUBLIC_TABLES = ['services', 'service_prices', 'experts', 'expert_services']

export function classifyKey(raw) {
  const key = String(raw ?? '').trim()
  if (!key || /\s/.test(key)) return 'unknown'
  if (/^sb_secret_/.test(key)) return 'secret'
  if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key)) return 'publishable'
  const parts = key.split('.')
  if (parts.length === 3) {
    try {
      const role = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).role
      if (role === 'anon') return 'anon-jwt'
      if (role === 'service_role') return 'service-role-jwt'
    } catch { /* fall through */ }
  }
  return 'unknown'
}

export function checkUrl(raw) {
  try {
    const u = new URL(String(raw ?? '').trim())
    if (u.protocol !== 'https:' || u.username || u.password || (u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) return null
    return u.origin
  } catch { return null }
}

const row = (check, result, detail = '') => ({ check, result, detail })

async function getJson(fetchFn, url, key, headers = {}) {
  let res
  try {
    res = await fetchFn(url, { method: 'GET', headers: { apikey: key, Accept: 'application/json', ...headers } })
  } catch {
    return { network: true }
  }
  let body = null
  try { body = await res.json() } catch { /* not JSON */ }
  return { status: res.status, body }
}

export async function runChecks({ url, key, fetchFn = fetch }) {
  const out = []
  const origin = checkUrl(url)
  const kind = classifyKey(key)
  out.push(origin ? row('project address is a valid https address', 'OK', new URL(origin).host) : row('project address is a valid https address', 'PROBLEM', 'missing or not an https project address without a path'))
  if (kind === 'publishable' || kind === 'anon-jwt') out.push(row('the key is a PUBLIC key', 'OK', kind))
  else if (kind === 'secret' || kind === 'service-role-jwt') {
    out.push(row('the key is a PUBLIC key', 'PROBLEM', 'this is a SECRET key. Stop: do not put it in the website or in this tool. Use the publishable key.'))
    return finish(out) // never send a secret key anywhere
  } else out.push(row('the key is a PUBLIC key', 'PROBLEM', 'missing or not recognised'))
  if (!origin || (kind !== 'publishable' && kind !== 'anon-jwt')) return finish(out)

  // ---- 1. authentication settings (public endpoint) ----
  const auth = await getJson(fetchFn, `${origin}/auth/v1/settings`, key)
  if (auth.network) out.push(row('the project answers', 'PROBLEM', 'no answer from the project address (check the address and your connection)'))
  else if (auth.status !== 200 || !auth.body) out.push(row('authentication settings readable', 'UNKNOWN', `HTTP ${auth.status}`))
  else {
    const b = auth.body
    out.push(row('the project answers', 'OK', 'authentication service reachable'))
    out.push(b.external && typeof b.external.email === 'boolean'
      ? row('email + password sign-in is enabled', b.external.email ? 'OK' : 'PROBLEM', '')
      : row('email + password sign-in is enabled', 'UNKNOWN', 'not reported'))
    out.push(typeof b.disable_signup === 'boolean'
      ? row('new sign-ups are allowed', b.disable_signup ? 'PROBLEM' : 'OK', b.disable_signup ? 'sign-ups are switched off in the dashboard' : '')
      : row('new sign-ups are allowed', 'UNKNOWN', 'not reported'))
    out.push(typeof b.mailer_autoconfirm === 'boolean'
      ? row('email confirmation is REQUIRED (not auto-confirmed)', b.mailer_autoconfirm ? 'PROBLEM' : 'OK', b.mailer_autoconfirm ? 'accounts would be confirmed without checking the email address' : '')
      : row('email confirmation is REQUIRED (not auto-confirmed)', 'UNKNOWN', 'not reported'))
    out.push(b.external && typeof b.external.anonymous_users === 'boolean'
      ? row('anonymous sign-ins are off', b.external.anonymous_users ? 'PROBLEM' : 'OK', '')
      : row('anonymous sign-ins are off', 'UNKNOWN', 'not reported: check in the dashboard'))
  }

  // ---- 2. public reference data (should be readable and seeded) ----
  const services = await getJson(fetchFn, `${origin}/rest/v1/services?select=slug,name,active&order=display_order`, key)
  if (services.network) out.push(row('services table readable', 'PROBLEM', 'no answer'))
  else if (services.status === 200 && Array.isArray(services.body)) {
    const slugs = services.body.map((s) => s.slug).sort().join(',')
    out.push(slugs === 'color-therapy,gemstone-guidance,numerology,palmistry'
      ? row('the four services exist (migrations applied and seeded)', 'OK', '4 services')
      : row('the four services exist (migrations applied and seeded)', 'PROBLEM', `found ${services.body.length}: ${slugs || 'none'}`))
  } else out.push(row('the four services exist (migrations applied and seeded)', 'PROBLEM', `HTTP ${services.status}${services.body?.code ? ' ' + services.body.code : ''}: the table may not exist or is not exposed`))

  const prices = await getJson(fetchFn, `${origin}/rest/v1/service_prices?select=service_slug,mode,amount_minor`, key)
  if (prices.status === 200 && Array.isArray(prices.body)) {
    const set = prices.body.filter((p) => p.amount_minor !== null).length
    out.push(row('12 price slots exist', prices.body.length === 12 ? 'OK' : 'PROBLEM', `${prices.body.length} slots, ${set} with a price set`))
    out.push(row('prices that are set', 'INFO', set === 0 ? 'none yet (expected before the owner sets prices)' : `${set} set`))
  } else out.push(row('12 price slots exist', 'PROBLEM', `HTTP ${prices.status ?? 'none'}`))

  for (const t of ['experts', 'expert_services']) {
    const r = await getJson(fetchFn, `${origin}/rest/v1/${t}?select=*&limit=1`, key)
    out.push(r.status === 200 ? row(`${t} readable by everyone (public reference data)`, 'OK', Array.isArray(r.body) && r.body.length === 0 ? 'empty so far' : 'has rows') : row(`${t} readable by everyone`, 'PROBLEM', `HTTP ${r.status ?? 'none'}`))
  }

  // ---- 3. private data must NOT be readable by the public key ----
  for (const t of PROTECTED_TABLES) {
    const r = await getJson(fetchFn, `${origin}/rest/v1/${t}?select=*&limit=1`, key)
    if (r.network) out.push(row(`${t}: closed to the public key`, 'UNKNOWN', 'no answer'))
    else if (r.status === 200 && Array.isArray(r.body) && r.body.length > 0) out.push(row(`${t}: closed to the public key`, 'PROBLEM', 'THE PUBLIC KEY CAN READ ROWS. Treat as a security incident.'))
    else if (r.status === 200) out.push(row(`${t}: closed to the public key`, 'UNKNOWN', 'answered with no rows: access exists but nothing is visible; compare with the owner post-check'))
    else if (r.status === 401 || r.status === 403) out.push(row(`${t}: closed to the public key`, 'OK', 'refused'))
    else if (r.status === 404) out.push(row(`${t}: closed to the public key`, 'PROBLEM', 'table not found: is the database installed in this project?'))
    else out.push(row(`${t}: closed to the public key`, 'UNKNOWN', `HTTP ${r.status}`))
  }

  // ---- 4. the "private" schema must not be exposed through the API ----
  const priv = await getJson(fetchFn, `${origin}/rest/v1/`, key, { 'Accept-Profile': 'private' })
  if (priv.network) out.push(row('schema "private" is not exposed through the API', 'UNKNOWN', 'no answer'))
  else if (priv.status === 200) out.push(row('schema "private" is not exposed through the API', 'PROBLEM', 'the API served the "private" schema'))
  else if (priv.body?.code === 'PGRST106' || priv.status === 406) out.push(row('schema "private" is not exposed through the API', 'OK', 'refused (not an exposed schema)'))
  else out.push(row('schema "private" is not exposed through the API', 'UNKNOWN', `HTTP ${priv.status}`))

  return finish(out)
}

function finish(rows) {
  const verdict = rows.some((r) => r.result === 'PROBLEM') ? 'STOP' : rows.some((r) => r.result === 'UNKNOWN') ? 'MANUAL CHECK NEEDED' : 'OK'
  return [...rows, { check: 'VERDICT', result: verdict, detail: verdict === 'OK' ? 'Everything this tool can see looks right. It does NOT prove sign-up emails, redirect addresses, authenticator codes or any logged-in behaviour.' : verdict === 'STOP' ? 'Fix every PROBLEM row before going on.' : 'No problem found, but some rows could not be determined from outside.' }]
}

export const tableLists = { PROTECTED_TABLES, PUBLIC_TABLES }
