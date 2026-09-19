import type { Config } from "jest";

const config: Config = {
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  transformIgnorePatterns: [
    "<rootDir>/node_modules/(?!(bullmq)/)"
  ],
  moduleFileExtensions: ["ts", "js", "json"],
  testEnvironment: "node",
};

export default config;

