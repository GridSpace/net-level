module.exports = {
    globalSetup: './tests/config/setup.js',
    globalTeardown: './tests/config/teardown.js',
    testPathIgnorePatterns: ['/node_modules/'],
    testTimeout: 5000
};
