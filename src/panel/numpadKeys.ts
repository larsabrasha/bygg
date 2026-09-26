/**
 * Sifferblockets tangenter, som miniräknaren i iOS: räknesätten i en kolumn
 * till höger med egen färg, OK längst ner där = brukar sitta, och radera och
 * parenteser överst som funktionsrad. Fyra per rad, uppifrån. Samma i 3D-vyn
 * (Numpad) och i VR-menyn (menuLayout), så att man känner igen sig.
 */

/** Tangentens färg: siffror, räknesätt, funktioner (översta raden) och OK. */
export type KeyTone = 'digit' | 'op' | 'fn' | 'ok'

/** En tangent: text som sätts in, eller en åtgärd. Med icon ritas en ikon i stället för label. */
export interface NumpadKey {
  label: string
  aria?: string
  icon?: 'back' | 'keyboard' | 'ok'
  insert?: string
  action?: 'back' | 'ok' | 'keyboard'
  tone: KeyTone
}

export const NUMPAD_KEYS: NumpadKey[] = [
  { label: 'Radera', aria: 'Radera', icon: 'back', action: 'back', tone: 'fn' },
  { label: '(', aria: 'Vänsterparentes', insert: '(', tone: 'fn' },
  { label: ')', aria: 'Högerparentes', insert: ')', tone: 'fn' },
  { label: '÷', aria: 'Delat med', insert: ' / ', tone: 'op' },
  { label: '7', insert: '7', tone: 'digit' },
  { label: '8', insert: '8', tone: 'digit' },
  { label: '9', insert: '9', tone: 'digit' },
  { label: '×', aria: 'Gånger', insert: ' * ', tone: 'op' },
  { label: '4', insert: '4', tone: 'digit' },
  { label: '5', insert: '5', tone: 'digit' },
  { label: '6', insert: '6', tone: 'digit' },
  { label: '−', aria: 'Minus', insert: ' - ', tone: 'op' },
  { label: '1', insert: '1', tone: 'digit' },
  { label: '2', insert: '2', tone: 'digit' },
  { label: '3', insert: '3', tone: 'digit' },
  { label: '+', aria: 'Plus', insert: ' + ', tone: 'op' },
  { label: 'Tangentbord', aria: 'Tangentbord', icon: 'keyboard', action: 'keyboard', tone: 'fn' },
  { label: '0', insert: '0', tone: 'digit' },
  { label: ',', aria: 'Komma', insert: ',', tone: 'digit' },
  { label: 'OK', aria: 'OK', icon: 'ok', action: 'ok', tone: 'ok' },
]
