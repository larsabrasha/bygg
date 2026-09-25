import { create, type StoreApi } from 'zustand'
import type { SketchMode } from '../model/combine'
import type { RulerPoint } from '../model/ruler'
import type { PlaneTargets } from '../model/snapping'
import type { Combine, ModelDocument, Shape } from '../model/types'
import { useDocumentStore, type Selection } from './documentStore'
import type { Face, Frame, Rect, Vec2, Vec3 } from '../model/types'

export type Tool = 'select' | 'rect' | 'circle' | 'pushpull' | 'move' | 'measure'

/**
 * Pågående rektangel: första hörnet är satt, current följer pekaren.
 * Med shape 'circle' är first mitten och current en punkt på kanten.
 */
export interface RectOp {
  kind: 'rect'
  shape?: Shape
  frame: Frame
  /** Kopian man ritar på, om man ritar på en dels yta. */
  on?: string
  /** Ytan man ritar på, i frame-koordinater. Null på golvet. */
  bounds: Rect | null
  /** Andra delars kanter projicerade på planet. */
  targets: PlaneTargets
  first: Vec2
  current: Vec2
  /** Om current snäppte till ett mål, per axel. */
  onTarget: [boolean, boolean]
}

export type PushPullTarget = { kind: 'sketch'; id: string } | { kind: 'body'; id: string; face: Face }

/** Pågående push/pull: distance mäts längs normal från anchor. */
export interface PushPullOp {
  kind: 'pushpull'
  target: PushPullTarget
  anchor: Vec3
  normal: Vec3
  /**
   * Var längs normalen man tog tag, räknat från anchor. Tar man i pilen en bit
   * ut från ytan ska ytan inte hoppa dit, utan följa med från där den är.
   */
  grab: number
  /** Avstånd där ytan hamnar i jämnhöjd med en annan dels kant. */
  targets: number[]
  distance: number
  /** För en skiss på en del: ny del, tillägg eller urtag (se SketchMode). Saknas = efter riktningen. */
  mode?: SketchMode
  /** Minsta distance för en dels yta (se pushPullMin). Saknas eller −∞ för en skiss, som kan dras åt båda hållen. */
  min?: number
  onTarget: boolean
}

/** Världsaxel: 0 = X, 1 = Y (uppåt), 2 = Z. */
export type Axis = 0 | 1 | 2

/**
 * Pågående flytt av en kopia: fritt i planet för sidan man tryckte på, eller
 * längs en världsaxel när man drar i en av de färgade pilarna.
 */
export interface MoveOp {
  kind: 'move'
  instanceId: string
  /**
   * Planet man flyttar i. Origo = där man tryckte (fri flytt) eller delens
   * mitt (pil). Längs en pil är u = axeln och delta[1] alltid 0.
   */
  plane: Frame
  axis: Axis | null
  /** Var längs axeln man tog tag i pilen, räknat från origo (som PushPullOp.grab). 0 vid fri flytt. */
  grab: number
  /** Den flyttade delens nyckelpunkter i planets koordinater (före flytt). */
  moving: Vec2[]
  /** Samma punkter i världen, för hjälplinjerna. */
  movingWorld?: Vec3[]
  /** Sidan man tog tag i (före flytt), vars kantmitter visas. Saknas när man drar i en pil. */
  face?: { frame: Frame; bounds: Rect }
  targets: PlaneTargets
  delta: Vec2
  onTarget: [boolean, boolean]
}

/** Pågående vridning av en kopia runt en världsaxel genom dess mitt (bågarna i Flytta-läget). */
export interface RotateOp {
  kind: 'rotate'
  instanceId: string
  axis: Axis
  /** Planet man vrider i: origo = delens mitt, n = axeln. Vinklar räknas från u mot v. */
  plane: Frame
  /** Radien på cirkeln som visas under vridningen, i mm. */
  radius: number
  /** Vinkeln där man tog tag, i grader. */
  grab: number
  /** Vridningen hittills i grader, positiv moturs sett från axelns spets. */
  angle: number
  /** Där man tog i bågen (på träffytan), för när bågen ses från kanten. */
  at?: Vec3
  /**
   * Satt när bågen ses nästan från kanten: då följer pekaren en linje längs
   * bågens tangent där man tog tag (from, dir), och vinkeln är sträckan
   * delad med radien. Annars räknas vinkeln där strålen skär planet.
   */
  line?: { from: Vec3; dir: Vec3; radius: number }
}

export type Op = RectOp | PushPullOp | MoveOp | RotateOp

/** Ett steg i en rad kopior: en förflyttning eller en vridning runt en axel genom center. */
export type CopyStep = { kind: 'move'; delta: Vec3 } | { kind: 'rotate'; center: Vec3; axis: Vec3; degrees: number }

/** Senaste kopieringen i Flytta-läget, så att man kan skriva ett antal och få fler i samma steg. */
export interface LastCopy {
  sourceId: string
  step: CopyStep
  /** Antal kopior hittills; kopia k ligger k steg från originalet. */
  count: number
  /** Den senast gjorda kopian. Antalet går bara att ändra så länge den finns och är vald. */
  lastId: string
}

/**
 * Den senast avslutade operationen, så att måttrutan kan ligga kvar och man
 * kan skriva ett nytt värde (som i SketchUp). Gäller bara så länge dokumentet
 * och valet är som direkt efteråt.
 */
export interface LastOp {
  op: Op
  doc: ModelDocument
  selection: Selection | null
  /**
   * Avslutad med OK, Enter eller Som förra: då stängs måttrutan. Efter ett drag
   * ligger den kvar med värdet, så att man kan skriva ett exakt mått i stället.
   */
  saved?: boolean
}

/** Var första hörnet skulle hamna (rektangelverktyget, bara mus). */
export interface HoverPoint {
  frame: Frame
  /** Ytan under pekaren, i frame-koordinater. Null på golvet. */
  bounds: Rect | null
  point: Vec2
  onTarget: boolean
  /** Hjälplinjer från det punkten snäppte i linje med (se guideLines). */
  guides: [Vec3, Vec3][]
}

interface ToolSnapshot {
  tool: Tool
  op: Op | null
  /** Ytan under muspekaren i push/pull- och flytta-läget (bara mus; touch har ingen hover). */
  hover: PushPullTarget | null
  hoverPoint: HoverPoint | null
  /** Inskrivna mått. Två fält för rektangel (längd, bredd), annars ett. */
  measure: [string, string]
  measureField: 0 | 1
  /** Senaste push/pull-djupet (med tecken), och uttrycket om det skrevs som ett. Glöms inte vid byte av verktyg. */
  lastPushPull: { distance: number; expr?: string } | null
  /** Flytta-läget gör kopior i stället för att flytta. Slås av när man byter verktyg. */
  copy: boolean
  lastCopy: LastCopy | null
  lastOp: LastOp | null
  /** Punkterna man tryckt på med Mät: ingen, en (väntar på nästa) eller två (visar avståndet). */
  ruler: RulerPoint[]
  /** Punkten under muspekaren med Mät (bara mus). */
  rulerHover: RulerPoint | null
  /**
   * Man har valt Skär ut eller Lägg till på host och ska trycka på delen som
   * är verktyget. error = varför förra trycket inte gick.
   */
  combining: { op: Combine['op']; host: string; error?: string } | null
}

interface ToolState extends ToolSnapshot {
  setTool: (tool: Tool) => void
  setOp: (op: Op | null) => void
  setHover: (hover: PushPullTarget | null) => void
  setHoverPoint: (p: HoverPoint | null) => void
  setMeasure: (field: 0 | 1, text: string) => void
  setMeasureField: (field: 0 | 1) => void
  setLastPushPull: (last: { distance: number; expr?: string }) => void
  setCopy: (copy: boolean) => void
  setLastCopy: (last: LastCopy | null) => void
  setLastOp: (last: LastOp | null) => void
  setRuler: (points: RulerPoint[]) => void
  setRulerHover: (p: RulerPoint | null) => void
  setCombining: (c: ToolSnapshot['combining']) => void
}

const idle = { op: null, measure: ['', ''] as [string, string], measureField: 0 as const }

const previous = import.meta.hot?.data.toolStore as StoreApi<ToolState> | undefined
const initial: ToolSnapshot = previous
  ? // Pågående operation kastas vid HMR; dess form kan ha ändrats i koden.
    {
      tool: previous.getState().tool,
      hover: null,
      hoverPoint: null,
      lastPushPull: previous.getState().lastPushPull ?? null,
      copy: previous.getState().copy ?? false,
      lastCopy: null,
      lastOp: null,
      ruler: [],
      rulerHover: null,
      combining: null,
      ...idle,
    }
  : {
      tool: 'select',
      hover: null,
      hoverPoint: null,
      lastPushPull: null,
      copy: false,
      lastCopy: null,
      lastOp: null,
      ruler: [],
      rulerHover: null,
      combining: null,
      ...idle,
    }

export const useToolStore = create<ToolState>()((set) => ({
  ...initial,
  setTool: (tool) =>
    set({
      tool,
      hover: null,
      hoverPoint: null,
      copy: false,
      lastCopy: null,
      lastOp: null,
      ruler: [],
      rulerHover: null,
      combining: null,
      ...idle,
    }),
  // En ny operation gör att förra kopieringen och förra operationen inte längre går att ändra.
  setOp: (op) => set(op ? { op, hoverPoint: null, lastCopy: null, lastOp: null } : idle),
  setHover: (hover) => set({ hover }),
  setCombining: (combining) => set({ combining }),
  setHoverPoint: (hoverPoint) => set({ hoverPoint }),
  setMeasure: (field, text) =>
    set((s) => {
      const measure: [string, string] = [...s.measure]
      measure[field] = text
      return { measure, measureField: field }
    }),
  setMeasureField: (measureField) => set({ measureField }),
  setLastPushPull: (lastPushPull) => set({ lastPushPull }),
  setCopy: (copy) => set({ copy }),
  setLastCopy: (lastCopy) => set({ lastCopy }),
  setLastOp: (lastOp) => set({ lastOp }),
  setRuler: (ruler) => set({ ruler }),
  setRulerHover: (rulerHover) => set({ rulerHover }),
}))

/**
 * Flytta hör till det valda: avmarkerar man (eller tar bort delen) går man
 * tillbaka till Välj, så att nästa del man väljer inte hamnar i Flytta.
 */
const unsubscribe = useDocumentStore.subscribe((s, prev) => {
  if (prev.selection && !s.selection && useToolStore.getState().tool === 'move')
    useToolStore.getState().setTool('select')
})

if (import.meta.hot) {
  import.meta.hot.data.toolStore = useToolStore
  import.meta.hot.dispose(unsubscribe)
}
