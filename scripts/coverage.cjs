// Purpose: Report executable source coverage, including untouched files.
// Caller: c8 via scripts/test-runner.cjs (ci suite).
// Dependencies: Source maps emitted into .test-build by tsconfig.test.json.
// Main Functions: Coverage include/exclude configuration (types and process entrypoints excluded).
// Side Effects: Writes text-summary, HTML and LCOV reports under coverage/.
module.exports = {
  all: true,
  src: ['.test-build/src'],
  include: ['.test-build/src/**/*.js'],
  exclude: [
    '**/*.types.js',
    '**/types/**',
    '**/server.js',
    '**/jobs/run-workers.js',
  ],
  reporter: ['text-summary', 'html', 'lcov'],
  'exclude-after-remap': false,
  'reports-dir': 'coverage',
}
