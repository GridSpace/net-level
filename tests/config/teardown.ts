import { TEST_DDIR } from '../testConstants';

module.exports = function teardown() {
    console.log({ TEARDOWN: TEST_DDIR });
    // eslint-disable-next-line no-undef
    try {
        process.kill(globalThis.__INTEG_TEST_SERVER_PID__);
    } catch (error) {
        console.log({ teardown_error: error });
    }
    require('fs-extra').remove(TEST_DDIR);
};
