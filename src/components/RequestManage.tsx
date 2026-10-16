import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useLoad } from '../hooks/useLoad'
import {
  dataErrorMessage, type DataErrorCode, type DataService, type ExpertInfo, type PaymentInfo, type RequestInfo, type RequestStatus,
} from '../lib/data'
import { formatDate, formatDateTime, formatMoney, isoToLocalInput, localInputToIso, modeLabel, serviceLabel } from '../lib/format'
import { Field } from './forms'
import { PaymentStatusBadge, RequestStatusBadge } from './RequestParts'
import { Notice } from './ui'

/** What a status means to the TEAM (the customer-facing wording is different). */
const teamHint: Record<string, string> = {
  submitted: 'New request. Check whether a payment reference has arrived, then start the review.',
  awaiting_confirmation: 'In review. Verify the payment, choose an expert and a time, then confirm.',
  confirmed: 'Confirmed with the customer. Mark it completed once the consultation has happened.',
  completed: 'Completed. No further changes can be made.',
  cancelled: 'Cancelled. No further changes can be made. Check the payments below if money was involved.',
}

/** The steps the database allows, by who is asking. (The database enforces them again; this only decides which buttons to show.) */
const ADMIN_NEXT: Record<string, Array<{ to: RequestStatus; label: string; danger?: boolean }>> = {
  submitted: [{ to: 'awaiting_confirmation', label: 'Start review (awaiting confirmation)' }, { to: 'cancelled', label: 'Cancel request', danger: true }],
  awaiting_confirmation: [{ to: 'cancelled', label: 'Cancel request', danger: true }],
  confirmed: [{ to: 'completed', label: 'Mark completed' }, { to: 'awaiting_confirmation', label: 'Back to awaiting confirmation' }, { to: 'cancelled', label: 'Cancel request', danger: true }],
}

function PaymentAdmin({ p, expectedLabel, service, onDone }: { p: PaymentInfo; expectedLabel: string; service: DataService; onDone: () => void }) {
  const [received, setReceived] = useState('') // deliberately empty: the administrator must type what the bank statement shows
  const [note, setNote] = useState('')
  const [failure, setFailure] = useState<DataErrorCode | null>(null)
  const [amountError, setAmountError] = useState<string | undefined>()
  const [pending, setPending] = useState(false)

  async function decide(decision: 'succeeded' | 'failed') {
    if (pending) return
    setFailure(null)
    let minor: number | null = null
    if (decision === 'succeeded') {
      const n = Number(received.trim())
      if (received.trim() === '' || !Number.isFinite(n) || n < 0) { setAmountError('Type the amount you saw in the bank statement.'); return }
      setAmountError(undefined)
      minor = Math.round(n * 100)
    }
    setPending(true)
    const r = await service.verifyPayment(p.id, decision, minor, note)
    setPending(false)
    if (r.ok) onDone()
    else setFailure(r.code)
  }
  async function refund() {
    if (pending) return
    setPending(true)
    setFailure(null)
    const r = await service.refundPayment(p.id, note)
    setPending(false)
    if (r.ok) onDone()
    else setFailure(r.code)
  }

  return (
    <li className="card card--flat">
      <div className="cluster" style={{ justifyContent: 'space-between' }}>
        <PaymentStatusBadge status={p.status} />
        <span className="hint">Submitted {formatDateTime(p.submittedAt)}</span>
      </div>
      <dl className="summary">
        <div><dt>UPI reference</dt><dd>{p.upiReference}</dd></div>
        <div><dt>Payer name</dt><dd>{p.payerName}</dd></div>
        <div><dt>Date paid</dt><dd>{formatDate(p.paidOn)}</dd></div>
        <div><dt>Expected</dt><dd>{expectedLabel}</dd></div>
        {p.receivedAmountMinor !== null && <div><dt>Received</dt><dd>{formatMoney(p.receivedAmountMinor)}</dd></div>}
      </dl>
      {failure && <Notice tone="danger" role="alert"><p>{dataErrorMessage[failure]}</p></Notice>}
      {(p.status === 'pending' || p.status === 'succeeded') && (
        <div className="form">
          {p.status === 'pending' && (
            <Field label="Amount you saw in the bank statement (₹)" error={amountError} hint="Look at the bank statement and type the amount you see. It is not filled in for you. Mark as received only if it matches the expected amount exactly.">
              {(a) => <input id={a.id} className="input" inputMode="decimal" value={received} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => { setReceived(e.target.value); setAmountError(undefined) }} />}
            </Field>
          )}
          <Field label="Internal note" optional hint="Only administrators see this. Don’t write bank credentials here.">
            {(a) => <input id={a.id} className="input" value={note} maxLength={500} aria-describedby={a.describedBy} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <div className="cluster">
            {p.status === 'pending' && (
              <>
                <button type="button" className="btn btn--primary btn--sm" disabled={pending} onClick={() => decide('succeeded')}>Verify: payment received</button>
                <button type="button" className="btn btn--ghost btn--sm" disabled={pending} onClick={() => decide('failed')}>Reject: could not match</button>
              </>
            )}
            {p.status === 'succeeded' && <button type="button" className="btn btn--ghost btn--sm" disabled={pending} onClick={refund}>Mark as refunded</button>}
          </div>
          {p.status === 'succeeded' && <p className="hint">“Mark as refunded” records that you returned the money yourself. This website doesn’t move money. Policy: 80% is refunded if the customer cancels before an expert is confirmed, nothing after; write the amount you returned in the note.</p>}
        </div>
      )}
    </li>
  )
}

/**
 * One request, for an administrator or an expert. Experts only ever receive requests assigned to them (the database filters),
 * can add notes, set a meeting link and mark a confirmed consultation as completed; they never see payments or other customers.
 */
export function RequestManage({ id, role, service, backTo }: { id: string; role: 'admin' | 'staff'; service: DataService; backTo: string }) {
  const request = useLoad(() => service.getRequest(id), [id, service])
  const notes = useLoad(() => service.listNotes(id), [id, service])
  const experts = useLoad(role === 'admin' ? () => service.listAllExperts() : null, [role, service])
  const prices = useLoad(() => service.listPrices(), [service])
  const customerId = request.state.status === 'done' ? request.state.data?.customerId : undefined
  const profile = useLoad(role === 'admin' && customerId ? () => service.getCustomerProfile(customerId) : null, [role, customerId, service])

  const [failure, setFailure] = useState<DataErrorCode | null>(null)
  const [saved, setSaved] = useState('')
  const [pending, setPending] = useState(false)
  const [expertId, setExpertId] = useState<string | null>(null)
  const [when, setWhen] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [noteError, setNoteError] = useState<string | undefined>()

  if (request.state.status === 'loading') return <Notice role="status"><p>Loading…</p></Notice>
  if (request.state.status === 'error') return <Notice tone="danger" role="alert"><p>{dataErrorMessage[request.state.code]}</p></Notice>
  const r: RequestInfo | null = request.state.data
  if (!r) return <Notice tone="warn" role="status"><p>That request wasn’t found, or isn’t available to you. <Link to={backTo}>Back to the list</Link></p></Notice>

  const closed = r.status === 'completed' || r.status === 'cancelled'
  const chosenExpert = expertId ?? r.assignedExpertId ?? ''
  const chosenWhen = when ?? isoToLocalInput(r.scheduledAt)
  const chosenLink = link ?? r.meetingLink ?? ''
  const eligible: ExpertInfo[] =
    experts.state.status === 'done' ? experts.state.data.filter((e) => e.active && e.serviceSlugs.includes(r.serviceSlug) && e.modes.includes(r.mode)) : []
  const price = prices.state.status === 'done' ? prices.state.data.find((p) => p.serviceSlug === r.serviceSlug && p.mode === r.mode)?.amountMinor ?? null : null
  const paymentVerified = r.payments.some((p) => p.status === 'succeeded')

  const refreshAll = () => { request.reload(); notes.reload() }

  async function run(label: string, patch: Parameters<DataService['updateRequest']>[1]) {
    if (pending) return
    setPending(true)
    setFailure(null)
    setSaved('')
    const res = await service.updateRequest(r!.id, patch)
    setPending(false)
    if (res.ok) {
      setSaved(label)
      setExpertId(null); setWhen(null); setLink(null)
      refreshAll()
    } else setFailure(res.code)
  }

  function linkProblem(): string | null {
    const l = chosenLink.trim()
    if (l && !/^https:\/\/\S+$/.test(l)) return 'The meeting link must start with https://'
    if (l.length > 500) return 'The meeting link is too long.'
    return null
  }

  function saveArrangement(e: FormEvent, confirm: boolean) {
    e.preventDefault()
    const problem = linkProblem()
    if (problem) { setFailure('invalid_input'); return }
    const patch: Parameters<DataService['updateRequest']>[1] = {
      assignedExpertId: chosenExpert || null,
      scheduledAt: localInputToIso(chosenWhen),
      meetingLink: chosenLink.trim() || null,
    }
    if (confirm) patch.status = 'confirmed'
    void run(confirm ? 'The consultation is confirmed.' : 'Saved.', patch)
  }

  async function addNote(e: FormEvent) {
    e.preventDefault()
    const body = noteText.trim()
    if (body.length < 1 || body.length > 2000) { setNoteError('Please write a note (up to 2000 characters).'); return }
    setNoteError(undefined)
    const res = await service.addNote(r!.id, body)
    if (res.ok) { setNoteText(''); notes.reload() }
    else setFailure(res.code)
  }

  return (
    <div className="stack">
      <div className="cluster" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 'var(--fs-h3)', margin: 0 }}>{serviceLabel(r.serviceSlug)} · {modeLabel(r.mode)}</h2>
        <RequestStatusBadge status={r.status} />
      </div>
      <p className="hint" style={{ margin: 0 }}>{teamHint[r.status]}</p>
      {saved && <Notice tone="success" role="status"><p>{saved}</p></Notice>}
      {failure && <Notice tone="danger" role="alert"><p>{dataErrorMessage[failure]}{failure === 'invalid_input' && linkProblem() ? ` ${linkProblem()}` : ''}</p></Notice>}

      <dl className="summary">
        <div><dt>Customer</dt><dd>{r.customerName}</dd></div>
        {profile.state.status === 'done' && profile.state.data && (
          <>
            <div><dt>Email</dt><dd>{profile.state.data.email || '—'}</dd></div>
            <div><dt>Phone</dt><dd>{profile.state.data.phone || '—'}</dd></div>
          </>
        )}
        <div><dt>Requested</dt><dd>{formatDateTime(r.createdAt)}</dd></div>
        <div><dt>Guidance asked for</dt><dd>{r.concern}</dd></div>
        {r.dateOfBirth && <div><dt>Date of birth given</dt><dd>{formatDate(r.dateOfBirth)}</dd></div>}
        {r.preferredLanguage && <div><dt>Language</dt><dd>{r.preferredLanguage}</dd></div>}
        {role === 'admin' && <div><dt>Price</dt><dd>{formatMoney(price)}</dd></div>}
        <div><dt>Expert</dt><dd>{(experts.state.status === 'done' && experts.state.data.find((e) => e.id === r.assignedExpertId)?.displayName) || (role === 'staff' ? 'You' : r.assignedExpertId ? 'Assigned' : 'Not assigned')}</dd></div>
        {r.scheduledAt && <div><dt>Scheduled</dt><dd>{formatDateTime(r.scheduledAt)}</dd></div>}
        {r.meetingLink && <div><dt>Meeting link</dt><dd><a href={r.meetingLink} target="_blank" rel="noreferrer noopener">{r.meetingLink}</a></dd></div>}
      </dl>

      {role === 'admin' && r.status !== 'completed' && r.status !== 'cancelled' && !paymentVerified && (
        <Notice tone="warn"><p><strong>No verified payment yet.</strong> You can still confirm a consultation, but the customer has not paid in full as far as the records show.</p></Notice>
      )}

      {/* ---- arrangement ---- */}
      {!closed && (
        <form className="card card--flat form" aria-label="Arrange the consultation" onSubmit={(e) => saveArrangement(e, false)}>
          <h3 style={{ fontSize: '1.2rem' }}>{role === 'admin' ? 'Expert, time and link' : 'Consultation link'}</h3>
          {role === 'admin' && (
            <>
              <Field label="Expert" hint={eligible.length === 0 ? 'No active expert offers this service and mode yet. Add one under Experts.' : 'Only experts who offer this service and mode are listed.'}>
                {(a) => (
                  <select id={a.id} className="select" value={chosenExpert} aria-describedby={a.describedBy} onChange={(e) => setExpertId(e.target.value)}>
                    <option value="">Not assigned</option>
                    {eligible.map((e) => <option key={e.id} value={e.id}>{e.displayName}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Date and time" hint="In your own time zone. Required to confirm.">
                {(a) => <input id={a.id} className="input" type="datetime-local" value={chosenWhen} aria-describedby={a.describedBy} onChange={(e) => setWhen(e.target.value)} />}
              </Field>
            </>
          )}
          <Field label="Meeting link" optional hint="For example a Google Meet link you created. Must start with https://. Only shown to the customer once confirmed.">
            {(a) => <input id={a.id} className="input" type="url" value={chosenLink} maxLength={500} aria-describedby={a.describedBy} onChange={(e) => setLink(e.target.value)} />}
          </Field>
          <div className="cluster">
            <button type="submit" className="btn btn--ghost btn--sm" disabled={pending}>Save</button>
            {role === 'admin' && r.status === 'awaiting_confirmation' && (
              <button type="button" className="btn btn--primary btn--sm" disabled={pending} onClick={(e) => saveArrangement(e as unknown as FormEvent, true)}>Save and confirm consultation</button>
            )}
          </div>
        </form>
      )}

      {/* ---- status ---- */}
      {!closed && (
        <div className="cluster" aria-label="Change status">
          {role === 'admin' && (ADMIN_NEXT[r.status] ?? []).map((s) => (
            <button key={s.to} type="button" className={`btn btn--sm ${s.danger ? 'btn--ghost' : 'btn--dark'}`} disabled={pending} onClick={() => run(`Status changed to ${s.to.replace('_', ' ')}.`, { status: s.to })}>{s.label}</button>
          ))}
          {role === 'staff' && r.status === 'confirmed' && (
            <button type="button" className="btn btn--dark btn--sm" disabled={pending} onClick={() => run('Marked as completed.', { status: 'completed' })}>Mark completed</button>
          )}
        </div>
      )}

      {/* ---- payments (administrators only; the database does not show payments to experts) ---- */}
      {role === 'admin' && (
        <section className="stack" aria-labelledby="pay-heading">
          <h3 id="pay-heading" style={{ fontSize: '1.2rem' }}>Payments</h3>
          {r.payments.length === 0 && <p>No payment reference has been submitted yet.</p>}
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {r.payments.map((p) => <PaymentAdmin key={p.id} p={p} expectedLabel={formatMoney(p.amountMinor)} service={service} onDone={refreshAll} />)}
          </ul>
        </section>
      )}

      {/* ---- notes ---- */}
      <section className="stack" aria-labelledby="notes-heading">
        <h3 id="notes-heading" style={{ fontSize: '1.2rem' }}>Internal notes</h3>
        <p className="hint" style={{ margin: 0 }}>Customers never see these. Don’t write passwords or banking details.</p>
        {notes.state.status === 'done' && notes.state.data.length === 0 && <p>No notes yet.</p>}
        {notes.state.status === 'done' && notes.state.data.length > 0 && (
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {notes.state.data.map((n) => (
              <li key={n.id} className={n.body.startsWith('ATTENTION') ? 'notice notice--warn' : 'card card--flat'}>
                <div>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{n.body}</p>
                  <span className="hint">{formatDateTime(n.createdAt)}{n.kind !== 'general' ? ` · ${n.kind}` : ''}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addNote} noValidate className="form" aria-label="New note">
          <Field label="Add a note" error={noteError}>
            {(a) => <textarea id={a.id} className="textarea" maxLength={2000} value={noteText} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => { setNoteText(e.target.value); setNoteError(undefined) }} />}
          </Field>
          <div><button type="submit" className="btn btn--ghost btn--sm">Add note</button></div>
        </form>
      </section>

      <div><Link className="btn btn--ghost" to={backTo}>Back to the list</Link></div>
    </div>
  )
}
