module.exports = function teardown() {
    // eslint-disable-next-line no-undef
    process.kill(globalThis.__INTEG_TEST_SERVER_PID__);
};
