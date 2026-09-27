import { useEffect, useRef } from 'react'

/**
 * Webbläsarens färgväljare som en ruta. Sparar först när väljaren stängs
 * (change), inte vid varje steg (input): annars blir varje drag i färgfältet
 * ett eget ångra-steg och en egen synk.
 */
export function ColorInput({
  value,
  onCommit,
  label,
}: {
  value: string
  onCommit: (color: string) => void
  label: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const commit = useRef(onCommit)
  useEffect(() => {
    commit.current = onCommit
  })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onChange = () => {
      if (el.value !== value) commit.current(el.value)
    }
    el.addEventListener('change', onChange)
    return () => el.removeEventListener('change', onChange)
  }, [value])
  return (
    <input
      ref={ref}
      type="color"
      aria-label={label}
      // Okontrollerad: den visar färgen medan man väljer. En ny färg utifrån ger en ny ruta.
      key={value}
      defaultValue={value}
      className="size-10 shrink-0 cursor-pointer rounded-lg border border-line bg-field p-1 narrow:size-11"
    />
  )
}
