/**
 * Ljuset i det skuggade utseendet: ett jämnt ljus och två huvudljus. Samma i
 * 3D-vyn och på modellbilderna (ThumbnailCapturer). on = false släcker dem
 * (realistiskt har eget ljus, se RealisticLight).
 */
export function ShadedLights({ on = true }: { on?: boolean }) {
  return (
    <>
      <ambientLight intensity={on ? 0.6 : 0} />
      <directionalLight position={[2000, 4000, 3000]} intensity={on ? 1.6 : 0} />
      <directionalLight position={[-3000, 2000, -1000]} intensity={on ? 0.4 : 0} />
    </>
  )
}
