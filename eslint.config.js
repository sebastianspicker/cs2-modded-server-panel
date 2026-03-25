// @ts-check
const tseslint = require('typescript-eslint');
const globals = require('globals');

const sharedRules = {
  'no-var': 'error',
  'prefer-const': ['error', { destructuring: 'all' }],
};

module.exports = tseslint.config(
  {
    ignores: ['node_modules/**', 'data/**', 'public/js/**', 'views/**', 'cfg/**', 'dist/**'],
  },
  // TypeScript files: use @typescript-eslint recommended rules
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ['**/*.ts'],
  })),
  {
    files: ['**/*.ts'],
    ignores: ['public/ts/**'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      ...sharedRules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
  // Client-side TypeScript: browser globals
  {
    files: ['public/ts/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.jquery },
    },
    rules: {
      ...sharedRules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // JavaScript files: standard rules only
  {
    files: ['**/*.js'],
    ignores: ['public/js/**'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: globals.node,
    },
    rules: {
      ...sharedRules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'no-undef': 'error',
    },
  }
);
