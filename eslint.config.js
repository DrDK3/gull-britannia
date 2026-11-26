import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const PURE_GAME_GLOBALS = ['window', 'document', 'performance', 'requestAnimationFrame', 'localStorage', 'navigator'];

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'out', 'test-results', 'playwright-report', 'public', 'research_notes', 'reports', '.claude'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // SailSim's rule, kept for the vendored simulation core: it must run unchanged in Node, the browser and a worker.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['three', 'three/*', 'react', 'react-dom', 'react/*'], message: 'src/sim must not import rendering or UI libraries.' },
          { group: ['**/render/**', '**/ui/**', '**/app/**'], message: 'src/sim must not depend on render/ui/app.' },
        ],
      }],
      'no-restricted-globals': ['error', 'window', 'document', 'performance', 'requestAnimationFrame'],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in src/sim/math/rng.ts.' },
        { object: 'Date', property: 'now', message: 'Simulation time must not depend on the wall clock.' }],
    },
  },
  {
    // Gull Britannia's game logic is deterministic and DOM-free (tsconfig.game.json checks the types; this checks the rest).
    files: ['src/gull/game/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['three', 'three/*', 'react', 'react-dom', 'react/*'], message: 'src/gull/game must not import rendering or UI libraries.' },
          { group: ['**/render/**', '**/ui/**', '**/app/**', '**/view/**'], message: 'src/gull/game must not depend on render, view, ui or app code.' },
        ],
      }],
      'no-restricted-globals': ['error', ...PURE_GAME_GLOBALS],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Use the seeded Rng in src/gull/game/rng.ts.' },
        { object: 'Date', property: 'now', message: 'Game time must not depend on the wall clock.' }],
    },
  },
  {
    // Node scripts and tests written as CommonJS.
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
