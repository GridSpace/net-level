import { TEST_PORT } from 'tests/testConstants';
import netLevelClient from 'lib/client.js';

describe('test harness for net-level-client', () => {
    let db;

    beforeAll(async () => {
        db = new netLevelClient();
        await db.open('localhost', TEST_PORT);
        await db.auth('admin', 'adminpass');

        const base = 'test';
        await db.use(base);
    });

    test('future use', async () => {
        await db.put('foo', 'boo');
        const result = await db.get('foo');
        expect(result).toEqual('boo');
    });

    test('future use', async () => {
        expect(true).toEqual(true);
        console.log('test goes here');
    });

    afterAll(async () => {
        await db.close();
    });
});
