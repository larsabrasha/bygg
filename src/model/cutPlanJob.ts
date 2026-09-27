import { buildCutList } from './cutlist'
import { buildCutPlan, type CutPlan } from './cutPlan'
import { isBuiltInMaterial, materialSpec, setCustomMaterials, type MaterialSpec } from './materials'
import type { Body, StockSettings } from './types'

/**
 * Det som behövs för att räkna fram kapschemat någon annanstans (i en Web Worker, se
 * panel/cutPlanWorker): delarna, inställningarna och de egna material de använder.
 * Workern har inte användarens egna material (se setCustomMaterials), så de följer med.
 */
export interface CutPlanJob {
  /**
   * Allt som påverkar schemat, som text: kaplistans rader, delarnas namn, materialen och
   * inställningarna. Lika nyckel ger lika schema; att flytta eller vrida en del ändrar den inte.
   */
  key: string
  bodies: Body[]
  settings: StockSettings
  materials: MaterialSpec[]
}

export function cutPlanJob(bodies: readonly Body[], settings: StockSettings = {}): CutPlanJob {
  const names = new Map(bodies.map((b) => [b.id, b.name]))
  const rows = buildCutList(bodies).rows
  const used = [...new Set(rows.map((r) => r.material))].map(materialSpec)
  const key = JSON.stringify([
    rows.map((r) => [r.material, r.thickness, r.length, r.width, r.bodyIds.map((id) => [id, names.get(id)])]),
    used,
    settings,
  ])
  // Bara delarna i kaplistan: verktyg och annat tas inte med till workern.
  const listed = new Set(rows.flatMap((r) => r.bodyIds))
  return {
    key,
    bodies: bodies.filter((b) => listed.has(b.id)),
    settings,
    materials: used.filter((m) => !isBuiltInMaterial(m.id)),
  }
}

/** Räknar jobbet i workern: dess egna material först, sedan schemat. */
export function runCutPlanJob(job: CutPlanJob): CutPlan {
  setCustomMaterials(job.materials)
  return buildCutPlan(job.bodies, job.settings)
}
