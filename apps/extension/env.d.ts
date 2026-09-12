/**
 * Build-time config WXT inlines from `.env` (see `.env.example`). Vite types
 * unknown `import.meta.env` keys as `any`; declaring them here keeps the
 * reads in `lib/config.ts` honest about being optional strings.
 */
interface ImportMetaEnv {
  readonly WXT_API_URL?: string;
  readonly WXT_API_TOKEN?: string;
}
