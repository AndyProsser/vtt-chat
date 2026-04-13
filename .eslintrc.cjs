module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2024: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2024,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:prettier/recommended',
  ],
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    'prettier/prettier': 'error',
  },
  overrides: [
    {
      files: ['backend/**/*.ts'],
      env: {
        node: true,
      },
      rules: {
        'react/react-in-jsx-scope': 'off',
      },
    },
    {
      files: ['frontend/**/*.{ts,tsx}'],
      env: {
        browser: true,
      },
      rules: {
        'react/react-in-jsx-scope': 'off',
      },
    },
    {
      files: ['**/*.js'],
      parserOptions: {
        sourceType: 'script',
      },
    },
  ],
}
