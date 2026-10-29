import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function groupBy<T, K>(rows: T[], key: (row: T) => K) {
  const groups = new Map<K, T[]>()
  for (const row of rows) {
    const k = key(row)
    const group = groups.get(k)
    if (group) group.push(row)
    else groups.set(k, [row])
  }
  return groups
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
