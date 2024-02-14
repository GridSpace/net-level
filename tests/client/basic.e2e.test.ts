import { CLIENT_TESTS } from 'tests/common/clientCoverage';
import { TEST_PORT } from 'tests/testConstants';

import netLevelClient from 'lib/client.js';

describe('test harness for net-level-client', () => {
    const client = new netLevelClient();

    test('open', async () => {
        await client.open('localhost', TEST_PORT);
    });

    CLIENT_TESTS({ client }, 'e2e');
});
