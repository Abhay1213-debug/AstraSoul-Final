import { Mail, MessageCircle, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { contactChannels, siteConfig } from '../config/site'
import { contactMessage, contactSubject, gmailComposeUrl, mailtoUrl, whatsappUrl } from '../lib/contact'

/**
 * A small button fixed to the bottom-right corner of every page. It opens two ways to reach the owner: WhatsApp and email. Each
 * opens the visitor's own app with a ready-made message that says which website and which page they came from.
 */
export function GetInTouch() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    panelRef.current?.querySelector<HTMLElement>('a')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Read at click time so the message names the page the visitor is on right now.
  const ctx = { page: pathname === '/' ? 'the home page' : typeof document !== 'undefined' ? document.title.split(' · ')[0] : undefined, path: pathname }
  const text = contactMessage(ctx)
  const subject = contactSubject(ctx)

  return (
    <div className="touch">
      {open && (
        <div className="touch__panel" role="dialog" aria-label="Get in touch" ref={panelRef}>
          <div className="touch__head">
            <strong>Get in touch right away</strong>
            <button type="button" className="touch__close" aria-label="Close" onClick={() => { setOpen(false); buttonRef.current?.focus() }}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <p className="touch__lede">Choose how you’d like to reach us. Your message is already written for you; just press send.</p>
          <a className="touch__option" href={whatsappUrl(text)} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={20} aria-hidden="true" />
            <span><strong>WhatsApp</strong><span className="touch__detail">{contactChannels.whatsappDisplay}</span></span>
          </a>
          {siteConfig.contactEmail && (
            <>
              <a className="touch__option" href={gmailComposeUrl(subject, text)} target="_blank" rel="noopener noreferrer">
                <Mail size={20} aria-hidden="true" />
                <span><strong>Gmail</strong><span className="touch__detail">{siteConfig.contactEmail}</span></span>
              </a>
              <a className="touch__alt" href={mailtoUrl(subject, text)}>Use another email app instead</a>
            </>
          )}
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        className="touch__button"
        aria-expanded={open}
        aria-label="Get in touch"
        onClick={() => setOpen((v) => !v)}
      >
        <MessageCircle size={20} aria-hidden="true" />
        <span>Get in touch</span>
      </button>
    </div>
  )
}
