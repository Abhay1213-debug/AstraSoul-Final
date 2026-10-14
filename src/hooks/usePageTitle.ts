import { useEffect } from 'react'
import { siteConfig } from '../config/site'

export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${siteConfig.brandName}` : `${siteConfig.brandName} — Personalized Spiritual Guidance`
  }, [title])
}
