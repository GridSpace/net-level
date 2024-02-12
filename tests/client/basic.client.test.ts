import { TEST_PORT } from 'tests/testConstants';
import netLevelClient from 'lib/client.js';

describe('test harness for net-level-client', () => {
    let db;

    beforeAll(async () => {
        db = new netLevelClient();
        await db.open('localhost', TEST_PORT);
        /*
        await db.auth('admin', 'adminpas');

        const base = 'test';
        await db.use(base);

        // await db.put('foo', 'boo');
        // const result = await db.get('foo');
        // console.log({ result });
        */
    });

    test('future use', () => {
        expect(true).toEqual(true);
        console.log('test goes here');
    });

    afterAll(async () => {
        await db.close();
    });
});
