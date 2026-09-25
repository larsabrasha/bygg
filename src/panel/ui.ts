/**
 * Delade Tailwind-klasser. Knappar är fyllda, utan kantlinje, med samma
 * rundning och höjd som måttrutan: 40 px på desktop, 44 px (touchyta) på smal skärm.
 */

export const fieldLabel = 'flex min-w-0 flex-col gap-1 text-xs text-muted'

/** Inmatningsfält och listrutor. */
export const field =
  'h-10 w-full min-w-0 rounded-lg border border-line bg-field px-2.5 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft narrow:h-11'

const button =
  'inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium disabled:cursor-default disabled:opacity-50 narrow:h-11'

export const primaryButton = `${button} bg-accent text-on-accent hover:opacity-90`

export const secondaryButton = `${button} bg-button text-ink hover:bg-hover`

export const dangerButton = `${button} bg-danger-soft text-danger hover:opacity-85`

/** Knapp som slår av och på ett läge (aria-pressed). */
export const toggleButton = `${button} bg-button text-ink hover:bg-hover aria-pressed:bg-accent-soft aria-pressed:text-accent`

/** Knapp utan bakgrund, t.ex. i en rad av åtgärder. */
export const ghostButton = `${button} text-ink hover:bg-hover`

/** Rubriken för en sektion i sidopanelen. Fliken visar namnet, så rubriken finns bara för skärmläsare. */
export const sectionTitle = 'sr-only'

/** Rubrik för en grupp inom en flik, t.ex. Mått eller Placering. */
export const groupTitle = 'text-[11px] font-semibold tracking-wider text-faint uppercase'

/** Kvadratisk ikonknapp: 36 px på desktop, 44 px på smal skärm. aria-pressed ger vald-läget. */
export const iconButton =
  'grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-hover aria-pressed:bg-accent-soft aria-pressed:text-accent narrow:size-11 disabled:cursor-default disabled:text-disabled disabled:hover:bg-transparent'

export const ICON = { size: 20, strokeWidth: 1.75, 'aria-hidden': true } as const
