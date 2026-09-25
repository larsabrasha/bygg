import { useSyncExternalStore } from 'react'

const QUERY = '(pointer: coarse)'

const subscribe = (onChange: () => void) => {
  const mq = matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

/** Om enheten styrs med finger (telefon, iPad): då används sifferblocket i stället för tangentbordet. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, () => matchMedia(QUERY).matches)
}
