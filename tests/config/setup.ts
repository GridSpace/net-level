import { spawn } from 'child_process';
import { TEST_PORT, TEST_DDIR } from '../testConstants';

module.exports = function setup() {
    return new Promise((resolve) => {
        const child = spawn('lib/server.js', [
            '--dir',  TEST_DDIR,
            '--port', TEST_PORT,
            '--user', 'admin',
            '--pass', 'adminpass',
        ]);
        // eslint-disable-next-line no-undef
        globalThis.__INTEG_TEST_SERVER_PID__ = child.pid;
        // child.stdout.on('data', (data) => {
        //     console.log('[server]', data.toString().trim());
        // });
        child.stderr.on('data', (data) => {
            console.log('[server-error]', data.toString().trim());
        });
        child.on('error', (error) => {
            console.log('[server-error]', error);
        });
        child.on('close', function () {
            console.log('SERVER SHUTDOWN', child.pid);
        });
        child.on('exit', (code, signal) => {
            console.log('SERVER EXIT', { code, signal });
        });
        console.log('SERVER STARTUP', child.pid);
        resolve(true);
    });
};
