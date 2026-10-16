import { contactChannels, siteConfig } from '../config/site'

/**
 * Builders for the "contact us" links. Every message starts with who is writing from where, so the owner knows the context when it
 * arrives. Nothing is sent by the website: the visitor's own WhatsApp or email app opens with the message ready, and the visitor
 * presses send.
 */
export interface ContactContext {
  /** The page the visitor was on, e.g. "Numerology". */
  page?: string
  /** The path of that page, e.g. "/services/numerology". */
  path?: string
}

const brand = () => siteConfig.brandName

export function contactMessage(ctx: ContactContext = {}): string {
  const where = ctx.page ? ` (I was looking at: ${ctx.page}${ctx.path ? `, ${ctx.path}` : ''})` : ''
  return `Hello Abhay, I'm connecting with you through the ${brand()} website${where}. I'd like to know more about your guidance. My question: `
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/${contactChannels.whatsappDigits}?text=${encodeURIComponent(text)}`
}

export function contactSubject(ctx: ContactContext = {}): string {
  return ctx.page ? `${brand()} website: question about ${ctx.page}` : `${brand()} website: question`
}

export function mailtoUrl(subject: string, body: string): string {
  return `mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** A Gmail "compose" address, for people on a laptop without a mail app set up. */
export function gmailComposeUrl(subject: string, body: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(siteConfig.contactEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
