/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/api/**/__tests__/**/*.test.js'],
  // api/_unused holds retired handlers parked by the deploy-time cut — they
  // don't resolve their _lib imports from there and must not run or count.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/api/_unused/'],
  moduleFileExtensions: ['js', 'json'],
  collectCoverageFrom: ['api/**/*.js', '!api/_ml/**', '!api/_unused/**', '!api/node_modules/**'],
  coverageDirectory: 'coverage',
  // Allow promise rejections to be handled asynchronously (e.g. after runAllTimersAsync).
  // Without this, Jest 30 + Node 22 incorrectly fails tests where a rejection is caught
  // in the very next statement after advancing fake timers.
  waitForUnhandledRejections: true,
}
