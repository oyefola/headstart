/**
 * Jest configuration to automatically load our Google Apps Script mocks
 * before running any tests.
 */
module.exports = {
    setupFiles: ["./__tests__/jest.setup.js"],
    testEnvironment: "node",
    testMatch: ["**/__tests__/**/*.test.js"],
};
