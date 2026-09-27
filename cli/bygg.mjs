#!/usr/bin/env node
// Kör CLI:t med tsx, så att det använder appens TypeScript-kod direkt (som servern).
import { register } from 'tsx/esm/api'

register()
await import('./index.ts')
