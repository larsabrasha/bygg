import { useEffect, useMemo, useState, type RefObject } from 'react'
import { DoubleSide, type Group } from 'three'
import { useDocumentStore } from '../../store/documentStore'
import { useToolStore } from '../../store/toolStore'
import { useViewStore } from '../../store/viewStore'
import { menuState, useVrHover, type VrUi } from './menuActions'
import { iconImage } from './menuIcons'
import { menuLayout, type MenuItem, type Tone } from './menuLayout'
import { textTexture } from './textTexture'

/**
 * Appens färger i mörkt läge (index.css), som sifferblocket i 3D-vyn (Numpad):
 * siffror som knappar, räknesätt i accentens ljusa ton, funktionsraden svagare
 * och OK i accentfärgen. Menyn är mörk också i ljust läge: den syns mot båda bakgrunderna.
 * hover är något ljusare än bakgrunden: strålen pekar där.
 */
const COLORS: Record<Tone, { bg: string; color: string; hover: string }> = {
  panel: { bg: 'rgba(36,34,31,0.94)', color: '#ebe7e0', hover: 'rgba(36,34,31,0.94)' },
  tool: { bg: '#36332e', color: '#ebe7e0', hover: '#4a4640' },
  toolActive: { bg: '#1f3552', color: '#6aa5f5', hover: '#2a4568' },
  digit: { bg: '#36332e', color: '#ebe7e0', hover: '#4a4640' },
  op: { bg: '#1f3552', color: '#6aa5f5', hover: '#2a4568' },
  fn: { bg: '#3e3c38', color: '#ebe7e0', hover: '#524f4a' },
  ok: { bg: '#6aa5f5', color: '#0c1a2e', hover: '#8ab9f8' },
  name: { bg: '#1f3552', color: '#6aa5f5', hover: '#2a4568' },
  field: { bg: '#1b1a18', color: '#ebe7e0', hover: '#1b1a18' },
  fieldActive: { bg: '#1b1a18', color: '#6aa5f5', hover: '#1b1a18' },
  hint: { bg: 'rgba(0,0,0,0)', color: '#a8a196', hover: 'rgba(0,0,0,0)' },
}

function MenuMesh({ item, hovered }: { item: MenuItem; hovered: boolean }) {
  const c = COLORS[item.tone]
  // Fälten har namn, värde och enhet på en rad, två bredvid varandra i en rektangel.
  // Som i sifferblocket i 3D-vyn: räknesätten något större än siffrorna.
  const size =
    item.tone === 'hint' || item.tone === 'name'
      ? 0.009
      : item.tone === 'op'
        ? 0.016
        : item.tone === 'digit' || item.tone === 'fn' || item.tone === 'ok'
          ? 0.014
          : item.tone === 'field' || item.tone === 'fieldActive'
            ? 0.0085
            : 0.011
  // Ikonen laddas som bild (se iconImage). Tills den finns står namnet där.
  const [image, setImage] = useState<{ key: string; img: HTMLImageElement } | null>(null)
  const iconKey = item.icon ? `${item.icon} ${c.color}` : null
  useEffect(() => {
    if (!item.icon || !iconKey) return
    let live = true
    void iconImage(item.icon, c.color).then((img) => live && setImage({ key: iconKey, img }))
    return () => {
      live = false
    }
  }, [item.icon, iconKey, c.color])
  const icon = useMemo(
    () => (image && image.key === iconKey ? { image: image.img, size: item.h * 0.62 } : null),
    [image, iconKey, item.h],
  )
  const texture = useMemo(
    () =>
      textTexture(item.label, {
        width: item.w,
        height: item.h,
        bg: hovered && item.action ? c.hover : c.bg,
        color: c.color,
        size,
        bold: item.tone !== 'hint',
        radius: item.tone === 'panel' ? 0.01 : 0.005,
        align: item.tone === 'field' || item.tone === 'fieldActive' ? 'right' : 'center',
        icon,
      }),
    [item.label, item.w, item.h, item.tone, item.action, hovered, c, size, icon],
  )
  useEffect(() => () => texture.dispose(), [texture])
  const ui: VrUi | undefined = item.action && { id: item.id, action: item.action }
  return (
    <mesh
      position={[item.x, item.y, item.tone === 'panel' ? 0 : 0.001]}
      // Efter modellen och bakgrunden före knapparna: utan djuptest avgör ordningen vad som hamnar överst.
      renderOrder={item.tone === 'panel' ? 10 : 11}
      userData={ui ? { vrUi: ui } : {}}
    >
      <planeGeometry args={[item.w, item.h]} />
      {/* Utan ljus och djuptest mot modellen: menyn syns alltid, också inne i en del. */}
      <meshBasicMaterial map={texture} transparent side={DoubleSide} depthTest={false} toneMapped={false} />
    </mesh>
  )
}

/**
 * Menyn på vänster hand (se menuLayout). Gruppens läge sätts av VrRig varje
 * bildruta, från handkontrollen. Måtten i gruppen är i meter: den ligger i
 * scenen genom origo, som är skalat MM_PER_M gånger.
 */
export function VrMenu({ group }: { group: RefObject<Group | null> }) {
  // Prenumerationer: menyn ritas om när något den visar ändras (menuState läser storarna).
  useToolStore((s) => s.tool)
  useToolStore((s) => s.op)
  useToolStore((s) => s.measure)
  useToolStore((s) => s.measureField)
  useToolStore((s) => s.ruler)
  useToolStore((s) => s.rulerHover)
  useToolStore((s) => s.lastOp)
  useToolStore((s) => s.lastCopy)
  useToolStore((s) => s.combining)
  useDocumentStore((s) => s.selection)
  useDocumentStore((s) => s.doc)
  useViewStore((s) => s.exploded)
  const hover = useVrHover((s) => s.id)
  const items = menuLayout(menuState())

  return (
    <group ref={group} matrixAutoUpdate={false} visible={false} userData={{ noThumb: true }}>
      {items.map((item) => (
        <MenuMesh key={item.id} item={item} hovered={hover === item.id} />
      ))}
    </group>
  )
}

/**
 * En skylt bredvid en handkontroll om vad knapparna gör. Läget sätts av VrRig
 * (se legendMatrix); måtten är i meter, som menyns.
 */
export function VrLegend({
  group,
  text,
  width,
  height,
}: {
  group: RefObject<Group | null>
  text: string
  width: number
  height: number
}) {
  const texture = useMemo(
    () =>
      textTexture(text, {
        width,
        height,
        bg: COLORS.panel.bg,
        color: COLORS.panel.color,
        // 9 mm: läsbart på en halvmeters avstånd.
        size: 0.009,
        align: 'left',
        radius: 0.006,
      }),
    [text, width, height],
  )
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <group ref={group} matrixAutoUpdate={false} visible={false} userData={{ noThumb: true }}>
      <mesh renderOrder={10}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} transparent side={DoubleSide} depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
