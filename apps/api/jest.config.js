/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testEnvironment: "node",
  testRegex: ".*\\.spec\\.ts$",
  moduleNameMapper: {
    "^@antara/contracts$": "<rootDir>/../../packages/contracts/src/index.ts",
    "^@antara/ui$": "<rootDir>/../../packages/ui/src/index.ts",
    "^@antara/shared-utils$": "<rootDir>/../../packages/shared-utils/src/index.ts",
    "^@nestjs/bullmq$": "<rootDir>/src/__mocks__/bullmq.ts",
    "^@nestjs/bull-shared$": "<rootDir>/src/__mocks__/bullmq.ts",
  },
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
  },
  transformIgnorePatterns: [
    "<rootDir>/node_modules/(?!(@antara|@xyflow)/)",
  ],
  collectCoverageFrom: ["src/**/*.(t|j)s"],
  coverageDirectory: "coverage",
};
