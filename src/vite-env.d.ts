/// <reference types="vite/client" />

declare module '*.png' {
  const src: string
  export default src
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_METER_SHARE_PUBLIC_ORIGIN?: string
  readonly VITE_SITE_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
