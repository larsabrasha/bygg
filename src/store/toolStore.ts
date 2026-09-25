import { create, type StoreApi } from 'zustand'
import type { PlaneTargets } from '../model/snapping'
import type { Face, Frame, Rect, Vec2, Vec3 } from '../model/types'

export type Tool = 'select' | 'rect' | 'pushpull' | 'move'

/** Pågående rektangel: första hörnet är satt, current följer pekaren. */
export interface RectOp {
  kind: 'rect'
  frame: Frame
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
  /** Avstånd där ytan hamnar i jämnhöjd med en annan dels kant. */
  targets: number[]
  distance: number
  onTarget: boolean
}

/** Pågående flytt av en kopia i planet för sidan man tryckte på. */
export interface MoveOp {
  kind: 'move'
  instanceId: string
  /** Planet man flyttar i. Origo = där man tryckte. */
  plane: Frame
  /** Den flyttade delens nyckelpunkter i planets koordinater (före flytt). */
  moving: Vec2[]
  targets: PlaneTargets
  delta: Vec2
  onTarget: [boolean, boolean]
}

export type Op = RectOp | PushPullOp | MoveOp

/** Var första hörnet skulle hamna (rektangelverktyget, bara mus). */
export interface HoverPoint {
  frame: Frame
  point: Vec2
  onTarget: boolean
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
}

interface ToolState extends ToolSnapshot {
  setTool: (tool: Tool) => void
  setOp: (op: Op | null) => void
  setHover: (hover: PushPullTarget | null) => void
  setHoverPoint: (p: HoverPoint | null) => void
  setMeasure: (field: 0 | 1, text: string) => void
  setMeasureField: (field: 0 | 1) => void
}

const idle = { op: null, measure: ['', ''] as [string, string], measureField: 0 as const }

const previous = import.meta.hot?.data.toolStore as StoreApi<ToolState> | undefined
const initial: ToolSnapshot = previous
  ? // Pågående operation kastas vid HMR; dess form kan ha ändrats i koden.
    { tool: previous.getState().tool, hover: null, hoverPoint: null, ...idle }
  : { tool: 'select', hover: null, hoverPoint: null, ...idle }

export const useToolStore = create<ToolState>()((set) => ({
  ...initial,
  setTool: (tool) => set({ tool, hover: null, hoverPoint: null, ...idle }),
  setOp: (op) => set(op ? { op, hoverPoint: null } : idle),
  setHover: (hover) => set({ hover }),
  setHoverPoint: (hoverPoint) => set({ hoverPoint }),
  setMeasure: (field, text) =>
    set((s) => {
      const measure: [string, string] = [...s.measure]
      measure[field] = text
      return { measure, measureField: field }
    }),
  setMeasureField: (measureField) => set({ measureField }),
}))

if (import.meta.hot) import.meta.hot.data.toolStore = useToolStore
