import { Rotate3d } from 'lucide-react'
import { useAr } from './ar'
import { Tip } from './Tip'

/**
 * AR-knappen bredvid VR-knappen i 3D-vyn (ViewButtons), med text som den. Finns bara där AR går att
 * starta; på smal skärm ligger AR i menyn Vy i stället.
 */
export function ArButton() {
  const ar = useAr()
  if (!ar.supported) return null
  return (
    <Tip label={ar.busy ? 'Förbereder AR…' : 'Visa i AR, i verklig storlek'}>
      <button
        aria-label="Visa i AR"
        disabled={ar.busy || !ar.available}
        onClick={() => void ar.open()}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[13px] font-medium hover:bg-hover disabled:cursor-default disabled:text-disabled disabled:hover:bg-transparent"
      >
        <Rotate3d size={18} strokeWidth={1.75} aria-hidden />
        AR
      </button>
    </Tip>
  )
}
