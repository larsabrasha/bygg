/**
 * Hur mycket av skärmen tangentbordet täcker, i px. Safari på iPhone och iPad
 * gör inte sidan lägre när tangentbordet öppnas; det läggs ovanpå, och bara den
 * synliga delen (visualViewport) krymper. Små skillnader (adressfältet som fälls
 * in, ett flytande tangentbord) räknas inte.
 */
export const KEYBOARD_MIN = 120

export function keyboardInset(layoutHeight: number, visibleHeight: number): number {
  const covered = Math.round(layoutHeight - visibleHeight)
  return covered >= KEYBOARD_MIN ? covered : 0
}
