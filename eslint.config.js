import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'playwright-report/', 'test-results/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // core/ must stay DOM-free so it can run in a worker and in Node tests.
    files: ['src/core/**/*.ts'],
    languageOptions: { globals: { ...globals.worker } },
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'src/core must not touch the DOM.' },
        { name: 'window', message: 'src/core must not touch the DOM.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/render/*', '**/ui/*', 'three'],
              message: 'core is pure; do not import render/ui/three.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
