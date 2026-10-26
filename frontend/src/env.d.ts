interface ImportMetaEnv {
  /** Backend base URL. Defaults to "/api" (the Vite dev proxy). */
  readonly VITE_API_URL?: string
  /** "true" on the public demo site: shows one-click demo logins. */
  readonly VITE_DEMO_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
