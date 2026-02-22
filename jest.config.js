/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/api/**/__tests__/**/*.test.js'],
  moduleFileExtensions: ['js', 'json'],
  collectCoverageFrom: ['api/**/*.js', '!api/ml/**', '!api/node_modules/**'],
  coverageDirectory: 'coverage',
  // Allow promise rejections to be handled asynchronously (e.g. after runAllTimersAsync).
  // Without this, Jest 30 + Node 22 incorrectly fails tests where a rejection is caught
  // in the very next statement after advancing fake timers.
  waitForUnhandledRejections: true,
}
