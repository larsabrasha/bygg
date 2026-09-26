import { isConstant } from '../model/expr'
import { numberFormat } from '../model/numberFormat'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore, type Axis } from '../store/toolStore'
import {
  amendableOp,
  applyMeasure,
  extendableCopy,
  faceDimension,
  liveMeasure,
  readyPushPull,
  startReadyPushPull,
  typedPushPull,
} from '../tools/actions'

const fmt = numberFormat(1)

/**
 * Vad måttrutan visar just nu: fälten, deras nuvarande värden, enheten och
 * hjälptexten. Läser storarna, som actions.ts. Gemensam för måttrutan
 * (MeasureBox) och måttpanelen i VR (VrMenu), så att de räknar lika.
 * Komponenter som använder den prenumererar själva på det som ändras.
 */
export function measureModel() {
  const { tool, op, measure, copy } = useToolStore.getState()
  // Efter en kopia kan man skriva hur många det ska bli (som "5x" i SketchUp).
  const extending = !op && tool === 'move' ? extendableCopy() : null
  // Efter ett drag ligger rutan kvar med värdet, så att man kan skriva ett exakt mått i stället.
  // Sparar man med OK (eller Enter, Som förra) stängs den. Skriver man ett tal direkt efteråt
  // (tangentbordet) visas den igen och ändrar det man nyss gjorde, som i SketchUp.
  const amendable = !op && !extending ? amendableOp() : null
  const amend = amendable && (!amendable.saved || measure.some((m) => m !== '')) ? amendable : null
  const shown = op ?? amend?.op ?? null
  // En vald sida eller skiss i Välj: rutan syns direkt, och det man skriver drar ut den.
  const ready = !shown && !extending ? readyPushPull() : null

  // I Välj syns rutan bara när något är valt, och under och direkt efter en operation.
  const visible = !(tool === 'select' && !shown && !ready)

  // Push/pull ser likadan ut hela vägen: vald sida, medan man drar och efter ett drag (ändra).
  // Samma text och samma knappar på samma plats, så att rutan inte hoppar när läget byts.
  const pushpullBox = ready !== null || shown?.kind === 'pushpull'
  const hint = extending
    ? 'Kopian är gjord. Skriv antal för fler med samma avstånd.'
    : pushpullBox
      ? 'Dra i pilen, eller skriv måttet.'
      : amend
        ? 'Klart. Skriv ett annat värde för att ändra.'
        : !op && tool === 'move' && copy
          ? 'Kopia: dra i en pil, en båge eller delen. Originalet står kvar.'
          : !op
            ? {
                select: '',
                rect: 'Tryck där första hörnet ska vara – på golvet eller på en yta.',
                circle: 'Tryck där mitten ska vara – på golvet eller på en yta.',
                pushpull: 'Dra i en skiss eller en sida av en del, eller tryck på den.',
                move: 'Dra i en pil för att flytta längs X, Y eller Z, eller i en båge för att vrida. Du kan också dra i själva delen.',
                measure: '',
              }[tool]
            : {
                rect:
                  op.kind === 'rect' && op.shape === 'circle'
                    ? 'Tryck där kanten ska vara, eller skriv diametern.'
                    : 'Tryck på andra hörnet, eller skriv längd och bredd.',
                pushpull: 'Dra längs pilen, eller skriv avståndet.',
                move:
                  op.kind === 'move' && op.axis !== null
                    ? 'Dra längs pilen, eller skriv avståndet.'
                    : 'Dra dit delen ska, eller skriv avståndet.',
                rotate: 'Dra runt bågen (steg om 15°), eller skriv vinkeln.',
              }[op.kind]

  // En sida på en del: fältet visar hela måttet (det delen blir), inte ändringen; den syns vid pilen.
  // Under draget är dokumentet som före, efteråt som efter.
  const faceTarget =
    shown?.kind === 'pushpull' && shown.target.kind === 'body'
      ? shown.target
      : !shown && ready?.kind === 'body'
        ? ready
        : null
  const dimension = faceTarget ? faceDimension(faceTarget) : null
  // Vad det skrivna blir: "+70" eller ett uttryck visar hela måttet efteråt under fältet.
  // Måttet före: under draget är dokumentet som före, efter ett drag (ändra) som efter.
  const pushpull = shown?.kind === 'pushpull' ? shown : null
  const base = dimension && pushpull ? dimension.extent - (op ? 0 : pushpull.distance) : null
  const typed = pushpull ? typedPushPull(pushpull, measure[0], base) : null
  const total = typed?.total != null && (!typed.whole || !isConstant(measure[0])) ? typed.total : null
  const live = dimension
    ? [dimension.extent + (op?.kind === 'pushpull' ? op.distance : 0)]
    : shown
      ? liveMeasure(shown)
      : extending
        ? [extending.count]
        : ready
          ? [0]
          : []
  const axis = shown?.kind === 'rotate' ? shown.axis : shown?.kind === 'move' ? shown.axis : null
  const fields: { label: string; axis: Axis | null }[] = extending
    ? [{ label: 'Antal kopior', axis: null }]
    : shown?.kind === 'rect' && shown.shape === 'circle'
      ? [{ label: 'Diameter', axis: null }]
      : shown?.kind === 'rect'
        ? [
            { label: 'Längd', axis: null },
            { label: 'Bredd', axis: null },
          ]
        : [{ label: dimension?.label ?? (shown?.kind === 'rotate' ? 'Vinkel runt' : 'Avstånd'), axis }]
  const unit = extending ? 'st' : shown?.kind === 'rotate' ? '°' : 'mm'

  return { visible, shown, amend, extending, ready, pushpullBox, hint, total, live, fields, unit }
}

export type MeasureField = { label: string; axis: Axis | null }

/** Skriver i ett fält. Det första man skriver med en vald sida startar dragningen av den (se readyPushPull). */
export function typeMeasure(field: 0 | 1, text: string) {
  if (measureModel().ready) startReadyPushPull()
  useToolStore.getState().setMeasure(field, text)
}

/**
 * OK: det man ändrat sparas, och i push/pull avmarkeras sidan, så att rutan inte
 * kommer tillbaka för samma sida och behöver ett OK till.
 */
export function submitMeasure() {
  const { ready, live, pushpullBox } = measureModel()
  const t = useToolStore.getState()
  const text = t.measure[0].trim()
  const unchanged = ready && !t.op && (text === '' || text === fmt.format(live[0] ?? 0))
  if (!unchanged && !applyMeasure()) return
  if (!pushpullBox) return
  // Fältet tomt igen, så att det inte står kvar till nästa sida som väljs.
  t.setMeasure(0, '')
  t.setMeasure(1, '')
  useDocumentStore.getState().select(null)
}
