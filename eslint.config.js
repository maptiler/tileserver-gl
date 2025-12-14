// eslint.config.js
import js from '@eslint/js';
import eslintPluginPrettier from 'eslint-plugin-prettier';
import tseslint from '@typescript-eslint/eslint-plugin';
import security from 'eslint-plugin-security';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';

export default [
  { ignores: ['public'] },
  js.configs.recommended,
  jsdoc.configs['flat/recommended'],
  {
    languageOptions: {
      parserOptions: {
        parser: '@typescript-eslint/parser',
        ecmaVersion: 2022,
        sourceType: 'module',
        lib: ['es2022'],
        ecmaFeatures: {
          jsx: true,
          tsx: true,
        },
      },
      globals: {
        ...globals.node, // Add Node.js globals
        ...globals.browser, // Add browser globals
        ...globals.es6, // Add ES6 globals
        ...globals.mocha, // Add Mocha globals (describe, it, before, after, etc.)
        supertest: 'readonly', // Mark supertest as a global read-only variable
        expect: 'readonly', // Mark expect as a global read-only variable if your assertion library isn't automatically detected
        app: 'readonly', // Mark app as a global read-only variable
        server: 'readonly', // Mark server as a global read-only variable
      },
    },
  },
  {
    plugins: {
      prettier: eslintPluginPrettier,
      '@typescript-eslint': tseslint,
      jsdoc: jsdoc,
      security: security,
    },
  },
  {
    rules: {
      ...tseslint.configs['recommended'].rules,
      ...tseslint.configs['eslint-recommended'].rules,
      'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: 'next|err|info|reject|^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'prettier/prettier': 'error',
      'jsdoc/require-description': 'warn',
      'security/detect-object-injection': 'warn',
    },
  },
];
