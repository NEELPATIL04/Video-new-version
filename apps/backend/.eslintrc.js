module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
  },
  overrides: [
    {
      // DEV_STANDARDS.md §3: enforce the Repository pattern mechanically —
      // controllers must go through a service/repository, never touch the
      // Prisma client directly.
      files: ['**/*.controller.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@prisma/client',
                message:
                  'Controllers must not import Prisma directly — go through a service/repository (DEV_STANDARDS.md §3, Repository pattern).',
              },
            ],
          },
        ],
      },
    },
  ],
};
