import { TEST_DDIR } from '../testConstants';

module.exports = function teardown() {
    // eslint-disable-next-line no-undef
    try {
        process.kill(globalThis.__INTEG_TEST_SERVER_PID__);
    } catch (error) {
        console.log({ teardown_error: error });
    }
    // this SHOULD come from testConstants, but we can't import here (yet)
    require('fs-extra').remove(TEST_DDIR);
};
