import { spawn } from 'child_process';
import { TEST_PORT } from '../testConstants';

module.exports = function setup() {
    return new Promise((resolve) => {
        const child = spawn('lib/server.js', ['--port', TEST_PORT]);
        // eslint-disable-next-line no-undef
        globalThis.__INTEG_TEST_SERVER_PID__ = child.pid;
        child.on('error', (err) => console.log({ err }));
        child.stdout.on('data', function () {
            console.log('[server]', child.pid);
            resolve(true);
        });
        child.on('close', function () {
            console.log('SERVER TEARDOWN', child.pid);
        });
    });
};
