const base = require("./jest.config");

module.exports = {
  ...base,
  testMatch: [
    "<rootDir>/force-app/main/default/lwc/mapaNacional/__tests__/*.test.js",
    "<rootDir>/force-app/main/default/lwc/almex_FormProductPrices/__tests__/*.test.js"
  ],
  collectCoverageFrom: [
    "force-app/main/default/lwc/mapaNacional/*.js",
    "force-app/main/default/lwc/almex_FormProductPrices/*.js"
  ],
  coverageThreshold: {
    global: { lines: 90, functions: 90, statements: 85, branches: 70 }
  }
};
