import { ArrowRight, Info, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { useReveal } from '../hooks/useReveal'
import { Rings } from './art'

type Variant = 'primary' | 'dark' | 'ghost'

export function ButtonLink({
  variant = 'primary', small, arrow, className = '', children, ...props
}: LinkProps & { variant?: Variant; small?: boolean; arrow?: boolean }) {
  return (
    <Link className={`btn btn--${variant}${small ? ' btn--sm' : ''} ${className}`} {...props}>
      {children}
      {arrow && <ArrowRight size={18} aria-hidden="true" />}
    </Link>
  )
}

export function TextLink({ children, ...props }: LinkProps) {
  return (
    <Link className="link-arrow" {...props}>
      {children}
      <ArrowRight size={16} aria-hidden="true" />
    </Link>
  )
}

type NoticeTone = 'info' | 'warn' | 'danger' | 'success'
const noticeIcons = { info: Info, warn: AlertTriangle, danger: AlertCircle, success: CheckCircle2 }

export function Notice({ tone = 'info', children, role, id }: { tone?: NoticeTone; children: ReactNode; role?: 'status' | 'alert'; id?: string }) {
  const Icon = noticeIcons[tone]
  return (
    <div className={`notice${tone === 'info' ? '' : ` notice--${tone}`}`} role={role} id={id}>
      <Icon size={20} aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

export function SectionHead({
  eyebrow, title, lede, center, split,
}: { eyebrow?: ReactNode; title: ReactNode; lede?: ReactNode; center?: boolean; split?: boolean }) {
  const ref = useReveal<HTMLDivElement>()
  const cls = `section-head reveal${center ? ' section-head--center' : ''}${split ? ' section-head--split' : ''}`
  return (
    <div ref={ref} className={cls}>
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {lede && <p className="lede">{lede}</p>}
    </div>
  )
}

export function Reveal({ children, className = '', as: Tag = 'div', delay = 0 }: { children: ReactNode; className?: string; as?: 'div' | 'li' | 'section'; delay?: number }) {
  const ref = useReveal<HTMLElement>()
  const Component = Tag as 'div'
  const style = delay ? ({ '--d': `${delay}s` } as React.CSSProperties) : undefined
  return <Component ref={ref as React.RefObject<HTMLDivElement>} className={`reveal ${className}`} style={style}>{children}</Component>
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p className="field-error" id={id}>
      <AlertCircle size={16} aria-hidden="true" />
      <span>{message}</span>
    </p>
  )
}

export function PageHero({ title, lede, eyebrow, crumbs, children }: {
  title: ReactNode; lede?: ReactNode; eyebrow?: string; crumbs?: { to?: string; label: string }[]; children?: ReactNode
}) {
  return (
    <section className="page-hero">
      <Rings className="page-hero__rings" />
      <div className="container">
        {crumbs && (
          <nav className="breadcrumb" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={c.label}>
                {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
                {i < crumbs.length - 1 && ' / '}
              </span>
            ))}
          </nav>
        )}
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
        {children}
      </div>
    </section>
  )
}
