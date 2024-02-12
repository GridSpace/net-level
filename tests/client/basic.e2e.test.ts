import { TEST_PORT, TEST_BASE } from 'tests/testConstants';
import netLevelClient from 'lib/client.js';

describe('test harness for net-level-client', () => {
    let client;

    // beforeAll(async () => {
    // });

    test('new db', async () => {
        client = new netLevelClient();
    });

    test('open', async () => {
        await client.open('localhost', TEST_PORT);
    });

    test('open stat no-auth', async () => {
        await client.stat().catch(error => {
            expect(error).toEqual('no command');
        });
    });

    test('auth', async () => {
        await client.auth('admin', 'adminpass');
    });

    test('auth stat ok', async () => {
        const reply = await client.stat();
        expect(reply.list?.length).toEqual(0);
        expect(reply.open?.length).toEqual(0);
    });

    test('use', async () => {
        await client.use(TEST_BASE);
    });

    test('use stat ok', async () => {
        const reply = await client.stat();
        expect(reply.list?.length).toEqual(1)
        expect(reply.open?.length).toEqual(1)
        expect(reply.list[0]).toEqual(TEST_BASE);
        expect(reply.open[0]).toEqual(TEST_BASE);
    });

    test('get', async () => {
        const result = await client.get('foo');
        expect(result === undefined);
    });

    test('put/get', async () => {
        await client.put('foo', 'bar');
        const result = await client.get('foo');
        expect(result).toEqual('bar');
    });

    test('put/list', async () => {
        for (let i=0; i<10; i++) {
            await client.put(i.toString().padStart(3,'0'), i);
        }
        const result = await client.list();
        expect(result?.length).toEqual(11);
    });

    test('list/limit/more/range', async () => {
        const r1 = await client.list({ limit: 3 });
        expect(r1?.length).toEqual(3);
        expect(r1[0].key).toEqual('000');
        const r2 = await client.more();
        expect(r2?.length).toEqual(3);
        expect(r2[0].key).toEqual('003');
        const r3 = await client.list({ gte: '003', lte: '006' });
        expect(r3?.length).toEqual(4);
    });

    test('del/get', async () => {
        await client.del('foo');
        const result = await client.get('foo');
        expect(result).toEqual(undefined);
    });

    test('sub/put/get', async () => {
        await client.sub('xyz');
        for (let i=0; i<10; i++) {
            await client.put(i.toString().padStart(3,'0'), i);
        }
        const r1 = await client.get('003');
        expect(r1).toEqual("3");
        const r2 = await client.list();
        expect(r2?.length).toEqual(10);
        await client.sub(["/"]);
        const r3 = await client.list();
        expect(r3?.length).toEqual(20);
    });

    test('sub/clear', async () => {
        await client.sub('xyz');
        await client.clear();
        const r2 = await client.list();
        expect(r2?.length).toEqual(0);
        await client.sub(["/"]);
        const r3 = await client.list();
        expect(r3?.length).toEqual(10);
    });

    test('add user/auth', async () => {
        await client.user("add", "sky", { pass: "blue" });
        await client.auth("sky", "blue");
        const user = await client.user("list", "sky");
        expect(user.perms?.halt).toEqual(false);
        const keys = await client.keys();
        expect(keys?.length).toEqual(10);
    });

    test('re-auth admin', async () => {
        await client.auth('admin', 'adminpass');
    });

    test('user del', async () => {
        const u1 = await client.user('list');
        expect(u1?.length).toEqual(2);
        await client.user('del', 'sky');
        const u2 = await client.user('list');
        expect(u2?.length).toEqual(1);
    });

    test('drop', async () => {
        await client.use();
        await client.drop(TEST_BASE);
    });

    test('stat after drop', async () => {
        const reply = await client.stat();
        expect(reply.list?.length === 0);
        expect(reply.open?.length === 0);
    });

    test('close', async () => {
        await client.close();
    });

    // afterAll(async () => {
    // });
});
