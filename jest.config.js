const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.base.json');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: 'tsconfig.base.json', allowJs: true }]
  },
  transformIgnorePatterns: ['node_modules/(?!(\\.pnpm/.*@nestjs|@nestjs)/)'],
  moduleNameMapper: {
    ...pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
    '^.*/load-package\\.util(\\..*)?$': '<rootDir>/apps/api/test/mocks/load-package.util.js'
  }
};
