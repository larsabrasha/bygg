import type { StockLayout } from '../model/cutPlan'
import { numberFormat } from '../model/numberFormat'
import { WOOD_SOURCES, woodFile } from '../scene/woodSources'
import { useInView } from './useInView'

/**
 * Kapschemat som riktiga brädor: trät är appens egen textur, delarna är ytorna
 * som sågas ut och det som blir över är streckat. Delarna kommer en i taget när
 * brädorna syns.
 */

const URLS = import.meta.glob<string>('../assets/wood/*.webp', { eager: true, query: '?url', import: 'default' })
const mm = numberFormat(0, true)

/** Hål där delarna är (evenodd), så att det streckade (spillet) bara syns utanför dem. */
function wasteMask(layout: StockLayout, board: StockLayout['boards'][number]) {
  const { length, width } = layout.stock
  const holes = board.map((p) => `M${p.x} ${p.y}h${p.w}v${p.h}h${-p.w}z`).join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${length} ${width}" preserveAspectRatio="none">` +
    `<path fill-rule="evenodd" d="M0 0h${length}v${width}H0z${holes}"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

export function Boards({ material, layout }: { material: string; layout: StockLayout }) {
  const [ref, shown] = useInView<HTMLDivElement>(0.3)
  const { length, width } = layout.stock
  const texture = URLS[`../assets/wood/${woodFile(material)}`]
  const textureMm = WOOD_SOURCES[material]?.mm ?? 740
  let n = 0

  return (
    <div ref={ref} className="flex flex-col gap-3 narrow:gap-2">
      {layout.boards.map((board, i) => {
        const mask = wasteMask(layout, board)
        return (
          <div
            key={i}
            className="relative overflow-hidden rounded-[3px] shadow-[0_1px_0_rgba(255,255,255,0.35)_inset,0_10px_24px_-12px_rgba(40,25,10,0.55),0_2px_4px_-2px_rgba(40,25,10,0.3)]"
            style={{
              // Inte i skala: en bräda 3 900 × 120 vore bara en linje. Delarnas lägen är i skala,
              // och en bredare bräda är högre än en smal.
              height: `max(26px, calc(clamp(40px, 5.2vw, 60px) * ${width / 120}))`,
              backgroundImage: `url(${texture})`,
              backgroundSize: `${(textureMm / length) * 100}% auto`,
              // Varje bräda är en egen bit av stocken.
              backgroundPosition: `${i * 37}% ${i * 61}%`,
            }}
          >
            {/* Spillet: streckat och lite mörkare, utanför delarna. */}
            <div
              className={`absolute inset-0 transition-opacity delay-700 duration-700 ${shown ? 'opacity-100' : 'opacity-0'}`}
              style={{
                background: 'repeating-linear-gradient(135deg, rgba(40,24,8,0.34) 0 2px, rgba(40,24,8,0.12) 2px 7px)',
                maskImage: mask,
                WebkitMaskImage: mask,
                maskSize: '100% 100%',
                WebkitMaskSize: '100% 100%',
              }}
            />
            {board.map((p) => {
              const delay = 120 + n++ * 45
              const big = p.w / length > 0.075 && p.h / width > 0.4
              return (
                <div
                  key={`${p.bodyId}-${p.x}`}
                  className={`absolute flex items-center justify-center overflow-hidden rounded-[1.5px] shadow-[inset_0_0_0_1px_rgba(50,30,10,0.55),inset_0_1px_0_1.5px_rgba(255,255,255,0.28)] transition-[opacity,transform] duration-500 ease-out ${
                    shown ? 'scale-100 opacity-100' : 'scale-[0.96] opacity-0'
                  }`}
                  style={{
                    left: `${(p.x / length) * 100}%`,
                    top: `${(p.y / width) * 100}%`,
                    width: `${(p.w / length) * 100}%`,
                    height: `${(p.h / width) * 100}%`,
                    transitionDelay: `${delay}ms`,
                  }}
                >
                  {big && (
                    <span className="truncate px-1 text-[11px] font-medium text-[#3a2410]/80 tabular-nums narrow:hidden">
                      {p.name} · {mm.format(p.length)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      <p className="sr-only">
        {layout.boards.length} brädor {mm.format(width)} × {mm.format(length)} mm med{' '}
        {layout.boards.reduce((s, b) => s + b.length, 0)} delar.
      </p>
    </div>
  )
}
