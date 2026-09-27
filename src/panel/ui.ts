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

/** Som dangerButton, men utan bakgrund tills man pekar på den: för det man sällan gör. */
export const quietDangerButton = `${button} text-danger hover:bg-danger-soft`

/** Knapp som slår av och på ett läge (aria-pressed). */
export const toggleButton = `${button} bg-button text-ink hover:bg-hover aria-pressed:bg-accent-soft aria-pressed:text-accent`

/**
 * Segmenterad kontroll (Lista/Kapschema, Material/Färger): en skena där det valda segmentet är en
 * ljus, lyft knapp, som på iOS. Inte accentfärgad, så att den inte förväxlas med en vald rad.
 * segmentGroup på raden (role="group"), segment på varje knapp, aria-pressed på den valda.
 */
export const segmentGroup = 'flex rounded-lg bg-button p-0.5'
export const segment =
  'h-9 flex-1 cursor-pointer rounded-md text-[13px] font-medium text-muted transition-colors hover:text-ink aria-pressed:bg-segment aria-pressed:text-ink aria-pressed:shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_1px_rgba(0,0,0,0.06)] narrow:h-10'

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

/** Fyrkantig ikonknapp i en ruta (måttrutan): kryss och bock. */
export const iconAction = 'grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg narrow:size-11'

/**
 * Rutan längst ner i 3D-vyn (måttrutan, valet av del för Tapp och Forma). På smal skärm står den vid
 * vänsterkanten och slutar före verktygslisten vid högerkanten, så att de inte
 * täcker varandra när vyn är låg (bladet med flikarna öppet).
 */
export const bottomBox =
  'absolute bottom-3 left-1/2 w-max max-w-[calc(100%-24px)] -translate-x-1/2 rounded-xl border border-line bg-panel/90 p-2 shadow-lg backdrop-blur-md narrow:left-3 narrow:max-w-[calc(100%-5rem)] narrow:translate-x-0'

/**
 * Listor är fyllda kort (listCard) med en svag linje mellan raderna (listRow), som på iOS: linjen börjar
 * där texten börjar, 12 px in, och går ut till kanten. Runt en vald (aria-selected) eller pekad rad göms
 * den, så att markeringen blir en hel yta; kortet rundar markeringen överst och nederst.
 */
export const listCard = 'flex flex-col overflow-hidden rounded-lg bg-hover'
export const listRow =
  'relative before:absolute before:top-0 before:right-0 before:left-3 before:h-px before:bg-line first:before:hidden'
/** listRow för en rad som går att välja: linjen göms mot markeringen och den pekade raden. */
export const selectableListRow = `${listRow} aria-selected:before:hidden hover:before:hidden [[aria-selected=true]+&]:before:hidden [:hover+&]:before:hidden`
