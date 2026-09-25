import { create } from 'zustand'

/**
 * Om sifferblocket (Numpad) är öppet. Måttrutan döljer då sin egen OK, så att
 * det inte finns två likadana knappar som gör samma sak (blocket har en).
 */
export const useNumpadStore = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
