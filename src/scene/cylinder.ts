import { CylinderGeometry } from 'three'

/** Segment runt en cylinder: runt nog på nära håll, och få nog för en iPad med många delar. */
export const CYLINDER_SEGMENTS = 64

/**
 * En cylinder med axeln längs n (three.js lägger den längs y), som en
 * utdragen cirkel i delens egna koordinater. Grupperna är den runda sidan,
 * n+ och n−, i den ordningen.
 */
export function cylinderGeometry(diameter: number, length: number): CylinderGeometry {
  return new CylinderGeometry(diameter / 2, diameter / 2, length, CYLINDER_SEGMENTS, 1).rotateX(Math.PI / 2)
}
