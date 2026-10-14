import { useState } from 'react'
import { Field } from '../components/forms'
import { ModeIcon } from '../components/icons'
import { Notice, PageHero, Reveal, StatusBadge } from '../components/ui'
import { featureStatus } from '../config/site'
import { modeById } from '../data/consultationModes'
import { experts } from '../data/experts'
import { isServiceSlug, serviceBySlug, services } from '../data/services'
import { usePageTitle } from '../hooks/usePageTitle'

export default function Experts() {
  usePageTitle('Experts')
  const [filter, setFilter] = useState('')
  const shown = experts.filter((e) => !filter || (isServiceSlug(filter) && e.services.includes(filter)))

  return (
    <>
      <PageHero eyebrow="Experts" title="Our experts" lede="Detailed guidance is provided by human experts. Here is how the directory will look.">
        <StatusBadge status={featureStatus.expertDirectory} />
      </PageHero>
      <section className="section">
        <div className="container stack">
          <Notice tone="warn" role="status">
            <p><strong>Demonstration profiles.</strong> No real expert information has been added yet. The profiles below are placeholders that show the structure of the directory. They do not describe real people, and contain no qualifications, experience or reviews.</p>
          </Notice>
          <div style={{ maxWidth: 360 }}>
            <Field label="Filter by service">
              {(a) => (
                <select id={a.id} className="select" value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="">All services</option>
                  {services.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                </select>
              )}
            </Field>
          </div>
          <p role="status" className="hint">{shown.length} demonstration {shown.length === 1 ? 'profile' : 'profiles'} shown</p>
          <div className="grid grid--3">
            {shown.map((e) => (
              <Reveal key={e.id}>
                <article className="expert">
                  <span className="expert__avatar" aria-hidden="true">
                    <svg viewBox="0 0 80 90" fill="currentColor" fillOpacity="0.28" stroke="currentColor" strokeWidth="1.2"><circle cx="40" cy="30" r="14" /><path d="M8 90c2-24 16-36 32-36s30 12 32 36Z" /></svg>
                  </span>
                  <span className="badge badge--demo" style={{ alignSelf: 'flex-start' }}>Demonstration profile</span>
                  <h3>{e.displayName}</h3>
                  <p>{e.bio}</p>
                  <dl>
                    <div><dt>Services</dt><dd>{e.services.map((s) => serviceBySlug(s)?.name).join(', ')}</dd></div>
                    <div><dt>Languages</dt><dd>{e.languages.length ? e.languages.join(', ') : 'To be confirmed'}</dd></div>
                    <div>
                      <dt>Consultation modes</dt>
                      <dd style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                        {e.modes.map((m) => { const mode = modeById(m)!; return <span key={m} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><ModeIcon icon={mode.icon} size={16} />{mode.id[0].toUpperCase() + mode.id.slice(1)}</span> })}
                      </dd>
                    </div>
                    <div><dt>Availability</dt><dd>{e.availability}</dd></div>
                  </dl>
                </article>
              </Reveal>
            ))}
          </div>
          <p className="hint">Experts are assigned by our team after you send a request; you don’t need to choose one yourself.</p>
        </div>
      </section>
    </>
  )
}
