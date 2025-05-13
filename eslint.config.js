import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.turbo', 'build'] }, // Added more common ignores
  {
    // @ts-expect-error: no-unsafe-assignment -- TODO: fix this
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked, prettierConfig],
    files: ['src/**/*.{ts,tsx}'], // Specify src directory for app files
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: './tsconfig.app.json', // Point to tsconfig.app.json
        tsconfigRootDir: import.meta.dirname,
      }
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Add any additional strict rules here if desired
      // e.g.: '@typescript-eslint/no-unused-vars': 'error',
    },
  },
  // Config for other files like vite.config.ts, eslint.config.js (if needed)
  // These might use tsconfig.node.json or a simpler config if not type-checked strictly
  {
    files: ['*.config.js', '*.config.ts'], // e.g., vite.config.ts, eslint.config.js
    languageOptions: {
      globals: globals.node,
    },
    // Optionally, extend with JS/TS recommendations if not covered by the main config
    // extends: [js.configs.recommended, ...tseslint.configs.recommended],
  }
)
