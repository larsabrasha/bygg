import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// public/icon.svg har egen bakgrund över hela ytan, så ingen utfyllnad behövs.
// Med standardinställningen får maskable-ikonen en vit ram (syns som en ring på Android).
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, padding: 0 },
    apple: { ...minimal2023Preset.apple, padding: 0 },
  },
  images: ['public/icon.svg'],
})
