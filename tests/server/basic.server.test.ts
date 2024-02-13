import { CLIENT_TESTS, TEST_DDIR } from 'tests/testConstants';
import netLevelClient from 'lib/client.js';
import netLevelServer from 'lib/server.js';

const { Piper } = require('../../lib/util.js');

describe('test harness for net-level-server', () => {

    const pipeA = new Piper("client");
    const pipeB = new Piper("server");
    pipeA.pipe(pipeB);
    pipeB.pipe(pipeA);
    new netLevelServer({
        dir: TEST_DDIR,
        user: "admin",
        pass: "adminpass",
        mock: pipeB,
    });
    const client = new netLevelClient({
        mock: pipeA
    });

    test('open', async () => {
        console.log({ client });
    });

    CLIENT_TESTS({ client }, "server");

});