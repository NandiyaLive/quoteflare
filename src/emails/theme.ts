import type { TailwindConfig } from '@react-email/components'

/**
 * Design tokens for every email. Colors are hex because many mail clients
 * do not support oklch. Change the look of all emails here.
 */
export const emailTailwindConfig = {
  theme: {
    extend: {
      colors: {
        page: '#f4f4f5',
        card: '#ffffff',
        ink: '#111111',
        'ink-2': '#3f3f46',
        'ink-3': '#71717a',
        line: '#e4e4e7',
      },
      fontFamily: {
        sans: ['Arial', 'Helvetica', 'sans-serif'],
      },
    },
  },
} satisfies TailwindConfig
