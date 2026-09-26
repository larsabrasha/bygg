/**
 * Vilken träff längs strålen som vinner, lägst först. Pilen på det valda,
 * flyttpilarna och bågarna ritas ovanpå allt och vinner över delar oavsett
 * avstånd. Den stora pilen går före de mindre på delens andra sidor (face),
 * som kan hamna nära den på en liten del. Bland dem går en pil före en båge: bågarna ligger mellan pilarna,
 * och där träffytorna möts ska det man siktar på (pilen) vinna, inte det som
 * råkar ligga närmast kameran. En pil som pekar rakt mot kameran (headOn) går
 * inte att dra i och ger plats åt bågen. Skisser och verktyg (spöken) får
 * företräde framför ytan de ligger på.
 */
export function pickScore(
  pick: { kind: string; tool?: unknown; headOn?: boolean; face?: unknown },
  distance: number,
): number {
  switch (pick.kind) {
    case 'handle':
      return pick.headOn ? GIZMO + 2 : pick.face ? GIZMO + 0.5 : GIZMO
    case 'axis':
      return pick.headOn ? GIZMO + 2 : GIZMO
    case 'rotate':
      return GIZMO + 1
    default:
      return distance - (pick.kind === 'sketch' || pick.tool ? 1 : 0)
  }
}

/** Långt under alla avstånd i scenen (mm), så att det som ritas ovanpå alltid vinner. */
const GIZMO = -1e12
