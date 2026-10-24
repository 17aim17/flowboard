import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/playwright-report', '**/test-results'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Fastify plugins and handlers are async by contract, even when they don't await.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  { files: ['*.js'], extends: [tseslint.configs.disableTypeChecked] },
  { files: ['apps/web/**/*.{ts,tsx}'], extends: [reactHooks.configs.flat.recommended] },
  {
    // API tests read response bodies of many shapes; typing each one would add noise, not safety.
    files: ['**/*.test.ts', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
);
