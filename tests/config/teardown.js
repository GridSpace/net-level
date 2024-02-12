// import { TEST_DDIR } from '../testConstants';
// import { fs } from 'fs-extra';

const fs = require('fs-extra');

module.exports = function teardown() {
    // eslint-disable-next-line no-undef
    try {
        process.kill(globalThis.__INTEG_TEST_SERVER_PID__);
    } catch (error) {
        console.log({ teardown_error: error });
    }
    // this SHOULD come from testConstants, but we can't import here (yet)
    fs.remove('test-data');
};
