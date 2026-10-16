import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { PaymentPanel, nextStep, RequestStatusBadge } from '../components/RequestParts'
import { ButtonLink, Notice, PageHero } from '../components/ui'
import { usePageTitle } from '../hooks/usePageTitle'
import { useLoad } from '../hooks/useLoad'
import { useAuth } from '../lib/auth'
import { dataErrorMessage, statusMeaning, useData, type DataErrorCode } from '../lib/data'
import { formatDate, formatDateTime, formatMoney, modeLabel, serviceLabel } from '../lib/format'

/** One of the customer's own requests. The database only ever returns requests that belong to the signed-in customer. */
export default function MyRequest() {
  const { id = '' } = useParams()
  const { state } = useAuth()
  const { service } = useData()
  usePageTitle('Your request')

  const request = useLoad(service && state.status === 'signed_in' ? () => service.getMyRequest(id) : null, [id, service, state.status])
  const settings = useLoad(service && state.status === 'signed_in' ? () => service.getPaymentSettings() : null, [service, state.status])
  const prices = useLoad(service && state.status === 'signed_in' ? () => service.listPrices() : null, [service, state.status])
  const experts = useLoad(service && state.status === 'signed_in' ? () => service.listExperts() : null, [service, state.status])
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelFailure, setCancelFailure] = useState<DataErrorCode | null>(null)
  const [cancelling, setCancelling] = useState(false)

  if (state.status === 'unavailable' || !service) return <Navigate to="/dashboard" replace />
  if (state.status === 'signed_out') return <Navigate to={`/login?next=${encodeURIComponent(`/dashboard/requests/${id}`)}`} replace />

  const body = () => {
    if (state.status === 'loading' || request.state.status === 'loading') return <Notice role="status"><p>Loading your request…</p></Notice>
    if (request.state.status === 'error') return <Notice tone="danger" role="alert"><p>{dataErrorMessage[request.state.code]}</p></Notice>
    const r = request.state.data
    if (!r) {
      return (
        <div className="stack">
          <Notice tone="warn" role="status"><p><strong>We couldn’t find that request.</strong> It may not exist, or it may not be yours.</p></Notice>
          <ButtonLink to="/dashboard" variant="ghost">Back to my dashboard</ButtonLink>
        </div>
      )
    }
    const price = prices.state.status === 'done' ? prices.state.data.find((p) => p.serviceSlug === r.serviceSlug && p.mode === r.mode)?.amountMinor ?? null : null
    const expert = experts.state.status === 'done' ? experts.state.data.find((e) => e.id === r.assignedExpertId) : undefined
    const canCancel = ['submitted', 'awaiting_confirmation'].includes(r.status) && !r.payments.some((p) => p.status === 'succeeded')

    return (
      <div className="stack">
        <div className="cluster" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 'var(--fs-h3)', margin: 0 }}>{serviceLabel(r.serviceSlug)} · {modeLabel(r.mode)}</h2>
          <RequestStatusBadge status={r.status} />
        </div>
        <Notice role="status"><p><strong>{statusMeaning[r.status]}</strong> {nextStep(r)}</p></Notice>

        <dl className="summary">
          <div><dt>Requested</dt><dd>{formatDate(r.createdAt)}</dd></div>
          <div><dt>Price</dt><dd>{formatMoney(price)}</dd></div>
          <div><dt>What you asked</dt><dd>{r.concern}</dd></div>
          {r.dateOfBirth && <div><dt>Date of birth given</dt><dd>{formatDate(r.dateOfBirth)}</dd></div>}
          {r.preferredLanguage && <div><dt>Language</dt><dd>{r.preferredLanguage}</dd></div>}
          <div><dt>Your expert</dt><dd>{expert ? expert.displayName : r.assignedExpertId ? 'Assigned' : 'Not assigned yet'}</dd></div>
          {r.scheduledAt && <div><dt>Time</dt><dd>{formatDateTime(r.scheduledAt)}</dd></div>}
          {r.meetingLink && r.status === 'confirmed' && (
            <div><dt>Meeting link</dt><dd><a href={r.meetingLink} target="_blank" rel="noreferrer noopener">{r.meetingLink}</a></dd></div>
          )}
        </dl>

        {r.status === 'confirmed' && !r.meetingLink && (
          <Notice><p>Your consultation is arranged by our team. If a call or meeting link is needed, we’ll add it here or contact you.</p></Notice>
        )}

        {settings.state.status === 'done' && (
          <PaymentPanel request={r} settings={settings.state.data} priceMinor={price} service={service} onChanged={request.reload} />
        )}
        {settings.state.status === 'error' && <Notice tone="danger" role="alert"><p>{dataErrorMessage[settings.state.code]}</p></Notice>}

        {canCancel && (
          <div className="stack">
            {cancelFailure && <Notice tone="danger" role="alert"><p>{dataErrorMessage[cancelFailure]}</p></Notice>}
            {!confirmCancel ? (
              <div><button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmCancel(true)}>Cancel this request</button></div>
            ) : (
              <Notice tone="warn">
                <p><strong>Cancel this request?</strong> This can’t be undone. If you have already paid, please contact us instead.</p>
                <div className="cluster" style={{ marginTop: 'var(--space-3)' }}>
                  <button type="button" className="btn btn--dark btn--sm" disabled={cancelling} onClick={async () => {
                    setCancelling(true)
                    const res = await service.cancelMyRequest(r.id)
                    setCancelling(false)
                    if (res.ok) { setConfirmCancel(false); setCancelFailure(null); request.reload() } else setCancelFailure(res.code)
                  }}>{cancelling ? 'Cancelling…' : 'Yes, cancel it'}</button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmCancel(false)}>Keep it</button>
                </div>
              </Notice>
            )}
          </div>
        )}
        <div><ButtonLink to="/dashboard" variant="ghost">Back to my dashboard</ButtonLink></div>
      </div>
    )
  }

  return (
    <>
      <PageHero eyebrow="Customer dashboard" title="Your request" crumbs={[{ to: '/dashboard', label: 'Dashboard' }, { label: 'Request' }]} />
      <section className="section">
        <div className="container container--narrow">{body()}</div>
      </section>
    </>
  )
}
