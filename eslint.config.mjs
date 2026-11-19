import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const nodeGlobals = Object.fromEntries(
  ['require', 'process', '__dirname', 'console', 'fetch', 'Buffer', 'URL'].map((g) => [
    g,
    'readonly',
  ]),
);

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      'release',
      'reports',
      'playwright-report',
      'test-results',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      // Simulations replay exactly from a seed, so all randomness goes through core/rng.
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded rng (core/rng.ts) instead.',
        },
      ],
    },
  },
  { files: ['scripts/**/*.{js,mjs}'], languageOptions: { globals: nodeGlobals } },
);
