import { create, type StoreApi } from 'zustand'
import type { Face, Frame, Rect, Vec2, Vec3 } from '../model/types'

export type Tool = 'select' | 'rect' | 'pushpull'

/** Pågående rektangel: första hörnet är satt, current följer pekaren. */
export interface RectOp {
  kind: 'rect'
  frame: Frame
  /** Ytan man ritar på, i frame-koordinater. Används för snäppning. Null på golvet. */
  bounds: Rect | null
  first: Vec2
  current: Vec2
}

export type PushPullTarget = { kind: 'sketch'; id: string } | { kind: 'body'; id: string; face: Face }

/** Pågående push/pull: distance mäts längs normal från anchor. */
export interface PushPullOp {
  kind: 'pushpull'
  target: PushPullTarget
  anchor: Vec3
  normal: Vec3
  distance: number
}

export type Op = RectOp | PushPullOp

interface ToolSnapshot {
  tool: Tool
  op: Op | null
  /** Ytan under muspekaren i push/pull-läget (bara mus; touch har ingen hover). */
  hover: PushPullTarget | null
  /** Inskrivna mått. Två fält för rektangel (längd, bredd), ett för push/pull. */
  measure: [string, string]
  measureField: 0 | 1
}

interface ToolState extends ToolSnapshot {
  setTool: (tool: Tool) => void
  setOp: (op: Op | null) => void
  setHover: (hover: PushPullTarget | null) => void
  setMeasure: (field: 0 | 1, text: string) => void
  setMeasureField: (field: 0 | 1) => void
}

const idle = { op: null, measure: ['', ''] as [string, string], measureField: 0 as const }

const previous = import.meta.hot?.data.toolStore as StoreApi<ToolState> | undefined
const initial: ToolSnapshot = previous
  ? (({ tool, op, hover, measure, measureField }) => ({ tool, op, hover, measure, measureField }))(previous.getState())
  : { tool: 'select', hover: null, ...idle }

export const useToolStore = create<ToolState>()((set) => ({
  ...initial,
  setTool: (tool) => set({ tool, hover: null, ...idle }),
  setOp: (op) => set(op ? { op } : idle),
  setHover: (hover) => set({ hover }),
  setMeasure: (field, text) =>
    set((s) => {
      const measure: [string, string] = [...s.measure]
      measure[field] = text
      return { measure, measureField: field }
    }),
  setMeasureField: (measureField) => set({ measureField }),
}))

if (import.meta.hot) import.meta.hot.data.toolStore = useToolStore
