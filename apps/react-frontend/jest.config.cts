module.exports = {
  displayName: 'react-frontend',
  preset: '../../jest.preset.js',
  testEnvironment: 'jsdom',
  transform: {
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '@nx/react/plugins/jest',
    '^.+\\.[tj]sx?$': ['babel-jest', { presets: ['@nx/react/babel'] }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/apps/react-frontend',
  moduleNameMapper: {
    '^@ragpolyglot-shared$': '<rootDir>/../../libs/shared/src/index.ts',
  },
};
