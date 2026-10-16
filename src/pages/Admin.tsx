import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AdminShell } from '../components/AdminShell'
import { Field } from '../components/forms'
import { PaymentStatusBadge, RequestStatusBadge, paymentHeadline } from '../components/RequestParts'
import { RequestManage } from '../components/RequestManage'
import { Notice } from '../components/ui'
import { useLoad } from '../hooks/useLoad'
import {
  dataErrorMessage, useData, type DataErrorCode, type DataService, type ExpertInfo, type Mode, type RequestInfo, type RequestStatus, type ServiceInfo,
} from '../lib/data'
import { formatDate, formatDateTime, formatMoney, modeLabel, serviceLabel } from '../lib/format'

const MODES: Mode[] = ['chat', 'voice', 'video']

function Loading<T>({ state }: { state: ReturnType<typeof useLoad<T>>['state'] }) {
  if (state.status === 'loading') return <Notice role="status"><p>Loading…</p></Notice>
  if (state.status === 'error') return <Notice tone="danger" role="alert"><p>{dataErrorMessage[state.code]}</p></Notice>
  return null
}

function RequestTable({ rows, base, showPayment = true }: { rows: RequestInfo[]; base: string; showPayment?: boolean }) {
  if (rows.length === 0) return <Notice role="status"><p>No requests match.</p></Notice>
  return (
    <div className="table-wrap">
      <table className="status-table">
        <thead>
          <tr><th>Customer</th><th>Service</th><th>Status</th>{showPayment && <th>Payment</th>}<th>Requested</th><th><span className="sr-only">Open</span></th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.customerName}</td>
              <td>{serviceLabel(r.serviceSlug)} · {modeLabel(r.mode)}</td>
              <td><RequestStatusBadge status={r.status} /></td>
              {showPayment && <td>{r.payments[0] ? <PaymentStatusBadge status={r.payments[0].status} /> : <span className="hint">{paymentHeadline(r)}</span>}</td>}
              <td>{formatDate(r.createdAt)}</td>
              <td><Link to={`${base}/${r.id}`}>Open<span className="sr-only"> request from {r.customerName}</span></Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ overview */
export function AdminOverview() {
  const { service } = useData()
  return (
    <AdminShell area="admin" title="Overview">
      {service && <OverviewBody service={service} />}
    </AdminShell>
  )
}

function OverviewBody({ service }: { service: DataService }) {
  const requests = useLoad(() => service.listRequests(), [service])
  const audit = useLoad(() => service.listAudit(8), [service])
  if (requests.state.status !== 'done') return <Loading state={requests.state} />
  const all = requests.state.data
  const count = (s: RequestStatus) => all.filter((r) => r.status === s).length
  const pendingPayments = all.filter((r) => r.payments.some((p) => p.status === 'pending')).length
  const tiles: Array<[string, number]> = [
    ['All requests', all.length],
    ['Payment references to check', pendingPayments],
    ['Awaiting confirmation', count('awaiting_confirmation')],
    ['Confirmed', count('confirmed')],
    ['Completed', count('completed')],
  ]
  return (
    <div className="stack">
      <div className="grid grid--3">
        {tiles.map(([label, n]) => (
          <div className="card card--flat" key={label}>
            <p className="hint" style={{ margin: 0 }}>{label}</p>
            <p style={{ fontSize: '2rem', margin: 0, fontFamily: 'var(--font-display, inherit)' }} aria-label={`${label}: ${n}`}>{n}</p>
          </div>
        ))}
      </div>
      <div className="cluster">
        <Link className="btn btn--primary btn--sm" to="/admin/requests">Open requests</Link>
      </div>
      <section className="stack" aria-labelledby="recent-heading">
        <h2 id="recent-heading" style={{ fontSize: 'var(--fs-h3)' }}>Recent activity</h2>
        {audit.state.status === 'done' && audit.state.data.length === 0 && <p>No activity yet.</p>}
        {audit.state.status === 'done' && audit.state.data.length > 0 && (
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {audit.state.data.map((a) => <li key={a.id} className="hint" style={{ margin: 0 }}>{formatDateTime(a.at)} · {a.actorKind} · {a.action} {a.entity}</li>)}
          </ul>
        )}
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ requests */
export function AdminRequests() {
  const { service } = useData()
  return <AdminShell area="admin" title="Requests">{service && <RequestsBody service={service} base="/admin/requests" />}</AdminShell>
}

function RequestsBody({ service, base }: { service: DataService; base: string }) {
  const [status, setStatus] = useState<RequestStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const list = useLoad(() => service.listRequests({ status, search }), [service, status, search])
  return (
    <div className="stack">
      <form className="cluster" role="search" aria-label="Filter requests" onSubmit={(e) => e.preventDefault()}>
        <Field label="Status">
          {(a) => (
            <select id={a.id} className="select" value={status} onChange={(e) => setStatus(e.target.value as RequestStatus | 'all')}>
              <option value="all">All</option>
              <option value="submitted">Submitted</option>
              <option value="awaiting_confirmation">Awaiting confirmation</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          )}
        </Field>
        <Field label="Search by customer name or service">
          {(a) => <input id={a.id} className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />}
        </Field>
      </form>
      {list.state.status === 'done' ? <RequestTable rows={list.state.data} base={base} /> : <Loading state={list.state} />}
    </div>
  )
}

export function AdminRequestDetail() {
  const { id = '' } = useParams()
  const { service } = useData()
  return <AdminShell area="admin" title="Request">{service && <RequestManage id={id} role="admin" service={service} backTo="/admin/requests" />}</AdminShell>
}

/* ------------------------------------------------------------------ staff */
export function StaffHome() {
  const { service } = useData()
  return (
    <AdminShell area="staff" title="My assigned requests">
      {service && <StaffList service={service} />}
    </AdminShell>
  )
}
function StaffList({ service }: { service: DataService }) {
  const list = useLoad(() => service.listRequests(), [service])
  if (list.state.status !== 'done') return <Loading state={list.state} />
  return (
    <div className="stack">
      <p className="hint" style={{ margin: 0 }}>You see only the requests assigned to you.</p>
      <RequestTable rows={list.state.data} base="/staff/requests" showPayment={false} />
    </div>
  )
}
export function StaffRequestDetail() {
  const { id = '' } = useParams()
  const { service } = useData()
  return <AdminShell area="staff" title="Request">{service && <RequestManage id={id} role="staff" service={service} backTo="/staff" />}</AdminShell>
}

/* ------------------------------------------------------------------ services & prices */
export function AdminServices() {
  const { service } = useData()
  return <AdminShell area="admin" title="Services & prices">{service && <ServicesBody service={service} />}</AdminShell>
}

function ServicesBody({ service }: { service: DataService }) {
  const services = useLoad(() => service.listAllServices(), [service])
  const prices = useLoad(() => service.listPrices(), [service])
  if (services.state.status !== 'done' || prices.state.status !== 'done') return <Loading state={services.state.status !== 'done' ? services.state : prices.state} />
  const pr = prices.state.data
  return (
    <div className="stack">
      <Notice role="status">
        <p>Prices are in rupees. Leave a price empty if it isn’t decided: customers then see “Price coming soon” and can’t submit a payment. <strong>Consultation length isn’t stored in the database yet</strong>, so it can’t be set here. Service descriptions are part of the website pages.</p>
      </Notice>
      {services.state.data.map((s) => (
        <ServiceEditor key={s.slug} s={s} prices={pr.filter((p) => p.serviceSlug === s.slug)} service={service} onSaved={() => { services.reload(); prices.reload() }} />
      ))}
    </div>
  )
}

function ServiceEditor({ s, prices, service, onSaved }: { s: ServiceInfo; prices: Array<{ mode: Mode; amountMinor: number | null }>; service: DataService; onSaved: () => void }) {
  const [name, setName] = useState(s.name)
  const [active, setActive] = useState(s.active)
  const [order, setOrder] = useState(String(s.displayOrder))
  const [amounts, setAmounts] = useState<Record<Mode, string>>(() => Object.fromEntries(MODES.map((m) => [m, prices.find((p) => p.mode === m)?.amountMinor == null ? '' : String((prices.find((p) => p.mode === m)!.amountMinor as number) / 100)])) as Record<Mode, string>)
  const [failure, setFailure] = useState<DataErrorCode | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)
  const [priceError, setPriceError] = useState<string | undefined>()

  async function save(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    setFailure(null); setSaved(false); setPriceError(undefined)
    const minor: Record<Mode, number | null> = { chat: null, voice: null, video: null }
    for (const m of MODES) {
      const t = amounts[m].trim()
      if (t === '') continue
      const n = Number(t)
      if (!Number.isFinite(n) || n <= 0 || n > 100000) { setPriceError('Prices must be a positive amount up to ₹1,00,000.'); return }
      minor[m] = Math.round(n * 100)
    }
    const ord = Number(order)
    if (!Number.isInteger(ord)) { setFailure('invalid_input'); return }
    setPending(true)
    const r1 = await service.updateService(s.slug, { name, active, displayOrder: ord })
    if (!r1.ok) { setPending(false); setFailure(r1.code); return }
    for (const m of MODES) {
      const was = prices.find((p) => p.mode === m)?.amountMinor ?? null
      if (was !== minor[m]) {
        const r = await service.setPrice(s.slug, m, minor[m])
        if (!r.ok) { setPending(false); setFailure(r.code); return }
      }
    }
    setPending(false)
    setSaved(true)
    onSaved()
  }

  return (
    <form className="card card--flat form" onSubmit={save} noValidate aria-label={`Settings for ${s.name}`}>
      <h2 style={{ fontSize: '1.3rem' }}>{s.name}</h2>
      {saved && <Notice tone="success" role="status"><p>Saved.</p></Notice>}
      {failure && <Notice tone="danger" role="alert"><p>{dataErrorMessage[failure]}</p></Notice>}
      <div className="form-grid form-grid--2">
        <Field label="Name shown">{(a) => <input id={a.id} className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Display order">{(a) => <input id={a.id} className="input" inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} />}</Field>
      </div>
      <label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Offered to customers (switch off to hide it)</span></label>
      <div className="form-grid form-grid--2">
        {MODES.map((m) => (
          <Field key={m} label={`${modeLabel(m)} price (₹)`} optional error={priceError && m === 'chat' ? priceError : undefined}>
            {(a) => <input id={a.id} className="input" inputMode="decimal" value={amounts[m]} onChange={(e) => setAmounts((x) => ({ ...x, [m]: e.target.value }))} />}
          </Field>
        ))}
      </div>
      <p className="hint">Currently shown to customers as: {MODES.map((m) => `${modeLabel(m)} ${formatMoney(prices.find((p) => p.mode === m)?.amountMinor ?? null)}`).join(' · ')}</p>
      <div><button type="submit" className="btn btn--primary btn--sm" disabled={pending}>{pending ? 'Saving…' : `Save ${s.name}`}</button></div>
    </form>
  )
}

/* ------------------------------------------------------------------ experts */
export function AdminExperts() {
  const { service } = useData()
  return <AdminShell area="admin" title="Experts">{service && <ExpertsBody service={service} />}</AdminShell>
}

function ExpertsBody({ service }: { service: DataService }) {
  const experts = useLoad(() => service.listAllExperts(), [service])
  const services = useLoad(() => service.listAllServices(), [service])
  const [editing, setEditing] = useState<ExpertInfo | 'new' | null>(null)
  if (experts.state.status !== 'done' || services.state.status !== 'done') return <Loading state={experts.state.status !== 'done' ? experts.state : services.state} />
  return (
    <div className="stack">
      <Notice role="status"><p>Only add real experts, with details they have agreed to share. Experts are listed on the website only while switched on. An expert’s login (so they can see their own requests) is granted separately by the site owner.</p></Notice>
      <div><button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing('new')}>Add an expert</button></div>
      {editing && (
        <ExpertForm
          key={editing === 'new' ? 'new' : editing.id}
          expert={editing === 'new' ? null : editing}
          services={services.state.data}
          service={service}
          onDone={() => { setEditing(null); experts.reload() }}
          onCancel={() => setEditing(null)}
        />
      )}
      {experts.state.data.length === 0 && !editing && <p>No experts yet.</p>}
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {experts.state.data.map((e) => (
          <li key={e.id} className="card card--flat">
            <div className="cluster" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '1.2rem', margin: 0 }}>{e.displayName}</h3>
              <span className={`badge badge--${e.active ? 'live' : 'planned'}`}>{e.active ? 'Active' : 'Switched off'}</span>
            </div>
            <p className="hint" style={{ margin: 0 }}>{e.serviceSlugs.map(serviceLabel).join(', ') || 'No services'} · {e.modes.map(modeLabel).join(', ') || 'No modes'}</p>
            <div><button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(e)}>Edit</button></div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ExpertForm({ expert, services, service, onDone, onCancel }: { expert: ExpertInfo | null; services: ServiceInfo[]; service: DataService; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(expert?.displayName ?? '')
  const [bio, setBio] = useState(expert?.bio ?? '')
  const [languages, setLanguages] = useState((expert?.languages ?? []).join(', '))
  const [modes, setModes] = useState<Mode[]>(expert?.modes ?? [])
  const [slugs, setSlugs] = useState<string[]>(expert?.serviceSlugs ?? [])
  const [note, setNote] = useState(expert?.availabilityNote ?? '')
  const [active, setActive] = useState(expert?.active ?? true)
  const [errors, setErrors] = useState<{ name?: string; bio?: string }>({})
  const [failure, setFailure] = useState<DataErrorCode | null>(null)
  const [pending, setPending] = useState(false)
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    const found: typeof errors = {}
    if (name.trim().length < 2 || name.trim().length > 80) found.name = 'Please enter a name (2–80 characters).'
    if (bio.length > 600) found.bio = 'Please keep the bio to 600 characters.'
    setErrors(found)
    setFailure(null)
    if (Object.keys(found).length > 0) return
    setPending(true)
    const r = await service.saveExpert({
      id: expert?.id, displayName: name, bio, active, modes, serviceSlugs: slugs, availabilityNote: note,
      languages: languages.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10),
    })
    setPending(false)
    if (r.ok) onDone()
    else setFailure(r.code)
  }

  return (
    <form className="card card--flat form" onSubmit={save} noValidate aria-label={expert ? `Edit ${expert.displayName}` : 'Add an expert'}>
      <h3 style={{ fontSize: '1.2rem' }}>{expert ? 'Edit expert' : 'Add an expert'}</h3>
      {failure && <Notice tone="danger" role="alert"><p>{dataErrorMessage[failure]}</p></Notice>}
      <Field label="Display name" error={errors.name}>{(a) => <input id={a.id} className="input" value={name} maxLength={80} aria-invalid={a.invalid} aria-describedby={a.describedBy} onChange={(e) => setName(e.target.value)} />}</Field>
      <Field label="Short bio" optional error={errors.bio} hint="Only facts the expert has approved. No invented credentials.">{(a) => <textarea id={a.id} className="textarea" value={bio} maxLength={700} aria-invalid={a.invalid} aria-describedby={a.describedBy} onChange={(e) => setBio(e.target.value)} />}</Field>
      <Field label="Languages" optional hint="Separate with commas.">{(a) => <input id={a.id} className="input" value={languages} aria-describedby={a.describedBy} onChange={(e) => setLanguages(e.target.value)} />}</Field>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>Services offered</legend>
        {services.map((s) => <label key={s.slug} className="check"><input type="checkbox" checked={slugs.includes(s.slug)} onChange={() => setSlugs((l) => toggle(l, s.slug))} /><span>{s.name}</span></label>)}
      </fieldset>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>Consultation modes</legend>
        {MODES.map((m) => <label key={m} className="check"><input type="checkbox" checked={modes.includes(m)} onChange={() => setModes((l) => toggle(l, m))} /><span>{modeLabel(m)}</span></label>)}
      </fieldset>
      <Field label="Availability note" optional>{(a) => <input id={a.id} className="input" value={note} maxLength={300} aria-describedby={a.describedBy} onChange={(e) => setNote(e.target.value)} />}</Field>
      <label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Active (can be assigned and is listed on the website)</span></label>
      <div className="cluster">
        <button type="submit" className="btn btn--primary btn--sm" disabled={pending}>{pending ? 'Saving…' : 'Save expert'}</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ payment settings */
export function AdminSettings() {
  const { service } = useData()
  return <AdminShell area="admin" title="Payment settings">{service && <SettingsBody service={service} />}</AdminShell>
}

function SettingsBody({ service }: { service: DataService }) {
  const settings = useLoad(() => service.getPaymentSettings(), [service])
  if (settings.state.status !== 'done') return <Loading state={settings.state} />
  return <SettingsForm initial={settings.state.data} service={service} onSaved={settings.reload} />
}

function SettingsForm({ initial, service, onSaved }: { initial: { upiId: string; payeeName: string; instructions: string }; service: DataService; onSaved: () => void }) {
  const [upi, setUpi] = useState(initial.upiId)
  const [payee, setPayee] = useState(initial.payeeName)
  const [instr, setInstr] = useState(initial.instructions)
  const [errors, setErrors] = useState<{ upi?: string }>({})
  const [failure, setFailure] = useState<DataErrorCode | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    setFailure(null); setSaved(false)
    const u = upi.trim()
    if (u && !/^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test(u)) { setErrors({ upi: 'A UPI ID looks like name@bank.' }); return }
    setErrors({})
    setPending(true)
    const todo: Array<['upi_id' | 'payee_name' | 'payment_instructions', string, string]> = [
      ['upi_id', u, initial.upiId], ['payee_name', payee.trim(), initial.payeeName], ['payment_instructions', instr.trim(), initial.instructions],
    ]
    for (const [key, value, was] of todo) {
      if (value === was || value === '') continue
      const r = await service.saveSetting(key, value)
      if (!r.ok) { setPending(false); setFailure(r.code); return }
    }
    setPending(false)
    setSaved(true)
    onSaved()
  }

  return (
    <form className="card card--flat form" onSubmit={save} noValidate aria-label="Payment settings">
      <Notice role="status"><p>Enter only the real UPI details of the business account. Until a UPI ID is saved, customers see “Payment instructions are being finalised” and can’t be told where to pay. This website never takes the payment itself.</p></Notice>
      {saved && <Notice tone="success" role="status"><p>Saved.</p></Notice>}
      {failure && <Notice tone="danger" role="alert"><p>{dataErrorMessage[failure]}</p></Notice>}
      <Field label="UPI ID" error={errors.upi} hint="For example name@bank.">{(a) => <input id={a.id} className="input" value={upi} maxLength={100} aria-invalid={a.invalid} aria-describedby={a.describedBy} onChange={(e) => setUpi(e.target.value)} />}</Field>
      <Field label="Name on the account" optional>{(a) => <input id={a.id} className="input" value={payee} maxLength={80} aria-describedby={a.describedBy} onChange={(e) => setPayee(e.target.value)} />}</Field>
      <Field label="Extra instructions for customers" optional hint="Shown with the payment steps. Don’t include any PIN, password or personal banking detail.">{(a) => <textarea id={a.id} className="textarea" value={instr} maxLength={500} aria-describedby={a.describedBy} onChange={(e) => setInstr(e.target.value)} />}</Field>
      <p className="hint">A saved value can be changed but not cleared here. To remove a value, ask the site owner.</p>
      <div><button type="submit" className="btn btn--primary btn--sm" disabled={pending}>{pending ? 'Saving…' : 'Save payment settings'}</button></div>
    </form>
  )
}

/* ------------------------------------------------------------------ audit */
export function AdminAudit() {
  const { service } = useData()
  return <AdminShell area="admin" title="Activity log">{service && <AuditBody service={service} />}</AdminShell>
}

function AuditBody({ service }: { service: DataService }) {
  const audit = useLoad(() => service.listAudit(200), [service])
  if (audit.state.status !== 'done') return <Loading state={audit.state} />
  return (
    <div className="stack">
      <p className="hint" style={{ margin: 0 }}>A record of changes made through the website and database. It is protected against ordinary edits, but it is not tamper-proof: the site owner can change database rules.</p>
      {audit.state.data.length === 0 ? <p>No activity yet.</p> : (
        <div className="table-wrap">
          <table className="status-table">
            <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
            <tbody>{audit.state.data.map((a) => <tr key={a.id}><td>{formatDateTime(a.at)}</td><td>{a.actorKind}</td><td>{a.action} · {a.entity}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
