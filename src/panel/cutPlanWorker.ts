import { runCutPlanJob, type CutPlanJob } from '../model/cutPlanJob'

// Appens typer har DOM, inte WebWorker: där kräver postMessage en mottagare.
const post = (message: unknown) => (self as unknown as { postMessage(m: unknown): void }).postMessage(message)

/** Räknar kapschemat utanför huvudtråden, så att appen inte står still under tiden (se useCutPlan). */
self.onmessage = (e: MessageEvent<{ id: number; job: CutPlanJob }>) => {
  const { id, job } = e.data
  try {
    post({ id, plan: runCutPlanJob(job) })
  } catch (error) {
    post({ id, error: String(error) })
  }
}
