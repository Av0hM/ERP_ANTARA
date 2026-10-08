/** @type {import('jest').Config} */
module.exports = {
  // Prefer authoritative TypeScript over checked-in, stale generated JS siblings.
  moduleFileExtensions: ["ts", "js", "json"],
  rootDir: ".",
  testEnvironment: "node",
  // Generated build output is not a test source or manual mock registry.
  modulePathIgnorePatterns: ["<rootDir>/dist/"],
  testRegex: ".*\\.(spec|e2e-spec)\\.ts$",
  moduleNameMapper: {
    "^@antara/contracts$": "<rootDir>/../../packages/contracts/src/index.ts",
    "^@antara/ui$": "<rootDir>/../../packages/ui/src/index.ts",
    "^@antara/shared-utils$":
      "<rootDir>/../../packages/shared-utils/src/index.ts",
    "^@nestjs/bullmq$": "<rootDir>/test/queue-decorators.fixture.ts",
    "^@nestjs/bull-shared$": "<rootDir>/test/queue-decorators.fixture.ts",
  },
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
  },
  transformIgnorePatterns: ["<rootDir>/node_modules/(?!(@antara|@xyflow)/)"],
  collectCoverageFrom: ["src/**/*.(t|j)s"],
  coverageDirectory: "coverage",
};
