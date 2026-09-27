/** Satt av vite.config.ts (define): vilken version som körs, för Om Bygg. */
interface ImportMetaEnv {
  /** Commitens hela hash, eller tomt om den inte gick att ta reda på. */
  readonly BUILD_COMMIT: string
  /** Fanns det ändringar som inte var incheckade när appen byggdes. */
  readonly BUILD_DIRTY: boolean
}
