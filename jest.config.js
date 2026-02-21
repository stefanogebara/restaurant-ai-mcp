/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/api/**/__tests__/**/*.test.js'],
  moduleFileExtensions: ['js', 'json'],
  collectCoverageFrom: ['api/**/*.js', '!api/ml/**', '!api/node_modules/**'],
  coverageDirectory: 'coverage',
}
