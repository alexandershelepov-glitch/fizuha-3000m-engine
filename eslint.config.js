import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
    },
  },
  {
    ignores: ['dist/**', 'web/dist/**', 'node_modules/**', '.npm/**', 'test-results/**', 'playwright-report/**'],
  },
);
