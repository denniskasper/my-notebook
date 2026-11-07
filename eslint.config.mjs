import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

// A module's index.ts is its only public surface: no deep imports into another module.
const deepModuleImport = {
  group: ['@/modules/*/*', '**/modules/*/*'],
  message: 'Import a module only through its index.ts (`@/modules/<module>`).',
};

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'dist/**',
      '.sandcastle/**',
      '.agents/**',
      '.claude/**',
      'node_modules/**',
      'drizzle/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...nextVitals,
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-imports': ['error', { patterns: [deepModuleImport] }],
    },
  },
  {
    // Drizzle tables reference each other for foreign keys; schema files may import
    // another module's schema.ts, and nothing else of it.
    files: ['src/modules/*/schema.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/modules/*/*', '**/modules/*/*', '!@/modules/*/schema'],
              message: deepModuleImport.message,
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/platform/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/modules', '@/modules/**', '**/modules/**'],
              message: '`platform` must not import any module.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
