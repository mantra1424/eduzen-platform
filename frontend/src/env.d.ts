interface ImportMetaEnv {
  /** Backend base URL. Defaults to "/api" (the Vite dev proxy). */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
