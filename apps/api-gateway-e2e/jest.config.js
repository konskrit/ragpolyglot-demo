/** @type {import('jest').Config} */
module.exports = {
  displayName: 'api-gateway-e2e',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  testTimeout: 120_000,
  maxWorkers: 1,
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js'],
};
