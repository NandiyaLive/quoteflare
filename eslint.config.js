import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      'dist',
      '.wrangler',
      '.tanstack',
      'src/routeTree.gen.ts',
      'worker-configuration.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'crypto',
          property: 'randomUUID',
          message: 'Create IDs with createId from #/lib/id.',
        },
      ],
    },
  },
  prettier,
)
