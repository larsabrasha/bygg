import type { ReactNode } from 'react'

/** Ordet i trä: en gradient i ekens färger. */
export function Wood({ children }: { children: ReactNode }) {
  return (
    <span className="bg-linear-to-br from-[#9a6a3a] via-[#c4955e] to-[#7d5129] bg-clip-text text-transparent dark:from-[#e0b27c] dark:via-[#f1cf9f] dark:to-[#c48e55]">
      {children}
    </span>
  )
}
