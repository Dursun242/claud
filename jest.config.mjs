// ═══════════════════════════════════════════════════════════════
// jest.config.mjs — config Jest via le preset officiel next/jest.
// ═══════════════════════════════════════════════════════════════
//
// next/jest s'occupe du transform SWC (pas besoin de babel-jest), du
// support des paths Next, et des stubs CSS/image automatiques.
//
// On reste minimal : pas de coverageThreshold imposé (on préfère croître
// organiquement plutôt que bloquer des PR légitimes).

import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  // setupFilesAfterEnv : modules lancés APRÈS l'installation de jest-environment
  // (donc après que `expect`/`describe`/`it` existent) mais AVANT l'exécution
  // des tests. C'est ici qu'on injecte les matchers de @testing-library/jest-dom.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  clearMocks: true,
}

export default createJestConfig(config)
