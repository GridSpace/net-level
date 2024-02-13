import { TEST_PORT, CLIENT_TESTS } from 'tests/testConstants';
import netLevelClient from 'lib/client.js';

const client = new netLevelClient();

describe('test harness for net-level-client', () => {

    test('open', async () => {
        await client.open('localhost', TEST_PORT);
    });

    CLIENT_TESTS({ client }, "e2e");

});
