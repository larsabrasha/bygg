import { Glasses } from 'lucide-react'
import { Tip } from './Tip'
import { enterVr, useVrAvailable } from './vr'

/**
 * VR-knappen bland knapparna i 3D-vyn, med text så att den syns. Står i en grupp med fokusläget (ViewButtons). Finns bara där VR
 * går att starta; på smal skärm ligger VR i menyn Vy i stället (ViewButtons).
 */
export function VrButton() {
  if (!useVrAvailable()) return null
  return (
    <Tip label="Visa i VR">
      <button
        aria-label="Visa i VR"
        onClick={() => void enterVr()}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[13px] font-medium hover:bg-hover"
      >
        <Glasses size={18} strokeWidth={1.75} aria-hidden />
        VR
      </button>
    </Tip>
  )
}
