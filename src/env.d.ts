/// <reference types="vite/client" />

/** Browser-visible environment variables. Only PUBLIC values may ever be declared here. */
interface ImportMetaEnv {
  readonly VITE_CONTACT_EMAIL?: string
  readonly VITE_BRAND_NAME?: string
  readonly VITE_BRAND_TAGLINE?: string
  /** Supabase project URL (public). */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase publishable (or legacy anon) key (public). Never a secret/service-role key. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Must be exactly "true" to switch on sign-up and log-in. Leave unset until the database is installed and checked. */
  readonly VITE_ACCOUNTS_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
