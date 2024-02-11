const { spawn } = require('child_process');

module.exports = function setup() {
    return new Promise((resolve) => {
        const child = spawn('lib/server.js', ['--port', '3005']);
        // eslint-disable-next-line no-undef
        globalThis.__INTEG_TEST_SERVER_PID__ = child.pid;
        child.on('error', (err) => console.log({ err }));
        child.stdout.on('data', function () {
            console.log('[server]', child.pid);
            resolve();
        });
        child.on('close', function () {
            console.log('server teardown');
        });
    });
};
