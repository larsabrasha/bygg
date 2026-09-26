import { useMemo } from 'react'
import { layoutMainViews, type MainView } from '../model/mainViews'
import { numberFormat } from '../model/numberFormat'
import { scaleLabel } from '../model/partSheet'
import { Dim, SheetSvg } from './PartSheet'

const num = numberFormat(1, true)

interface Props {
  size: { width: number; depth: number; height: number }
  /** Bilderna av vyerna (OrthoRenderer); en vy utan bild ritas som en tom ruta tills den finns. */
  images: Partial<Record<MainView, string>>
  modelName: string
  date: string
  count: number
  sheet: number
  sheets: number
}

/** Huvudvyerna: hela modellen framifrån, från vänster och ovanifrån, med yttermåtten. */
export function MainViewsSheet({ size, images, modelName, date, count, sheet, sheets }: Props) {
  const layout = useMemo(() => layoutMainViews(size), [size])
  return (
    <SheetSvg
      label={`Huvudvyer för ${modelName}`}
      note="Mått i mm. Projektion enligt E-metoden: vy från vänster till höger, vy ovanifrån under."
      cells={[
        { dx: 0, dy: 0, w: 95, h: 12, label: 'Benämning', value: modelName, size: 4, bold: true },
        { dx: 95, dy: 0, w: 30, h: 12, label: 'Blad', value: `${sheet} (${sheets})`, size: 4 },
        { dx: 0, dy: 12, w: 65, h: 9, label: 'Innehåll', value: 'Huvudvyer' },
        {
          dx: 65,
          dy: 12,
          w: 60,
          h: 9,
          label: 'Yttermått B × D × H',
          value: `${num.format(size.width)} × ${num.format(size.depth)} × ${num.format(size.height)}`,
        },
        { dx: 0, dy: 21, w: 50, h: 9, label: 'Datum', value: date },
        { dx: 50, dy: 21, w: 25, h: 9, label: 'Skala', value: scaleLabel(layout.scale) },
        { dx: 75, dy: 21, w: 50, h: 9, label: 'Antal delar', value: String(count) },
      ]}
    >
      {(Object.keys(layout.views) as MainView[]).map((view) => {
        const r = layout.views[view]
        const url = images[view]
        return url ? (
          <image key={view} href={url} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" />
        ) : null
      })}
      {layout.dims.map((d, i) => (
        <Dim key={i} dim={d} />
      ))}
    </SheetSvg>
  )
}
