#!/usr/bin/env node

const args = process.argv.slice(2);
const client = require('./client');
const { log } = require('./util');

if (args.length < 2) {
    console.log('usage: host/port/user/pass/base host/port/user/pass/base query');
    process.exit();
}

function parse(tok) {
    let toks = tok.split('/');
    return {
        host: toks[0] || 'localhost',
        port: parseInt(toks[1] || 3000),
        user: toks[2] || 'user',
        pass: toks[3] || undefined,
        base: toks[4] || undefined
    };
}

async function connect(rec) {
    const db = new client();
    await db.open(rec.host, rec.port);
    await db.auth(rec.user, rec.pass);
    await db.use(rec.base);
    return db;
}

// for use in mode settings eval
const series = 1;
const b1t = parse(args[0]);
const b2t = parse(args[1]);
const q = eval(`(${args[2] || '{}'})`);
const can_clone = b1t.host !== b2t.host || b1t.base !== b2t.base;

const interval = parseInt(q.interval || 0) * 1000;
const overlap = q.overlap;
const mode = q.mode;

delete q.interval;
delete q.overlap;
delete q.mode;

log('[net-level-clone]', [b1t.host, b1t.port, b1t.base], [b2t.host, b2t.port, b2t.base]);

async function do_clone(b1, b2) {
    // (time) series continues after last key from destination base
    // with the option to include that record again with overlap:true
    // which is useful when the last record will be updated several times
    // before being finalized and the next record written (streaming + historical)
    if (mode === series) {
        const lastkey = await b2.list({ reverse: true, limit: 1, values: false });
        if (lastkey && lastkey.length) {
            log({ lastkey: lastkey[0].key });
            if (overlap) {
                q.gte = lastkey[0].key;
            } else {
                q.gt = lastkey[0].key;
            }
        }
    }

    const pro = [];

    await b1.list(q, (key, value) => {
        log({ get: key });
        if (key && value) {
            pro.push(b2.put(key, value)
                .then(() => {
                    log({ put: key });
                })
                .catch((/*error*/) => {
                    log({ put_error: key });
                    b1.close();
                })
            );
            // batch promise resolution
            if (pro.length > 500) {
                let group = Promise.all(pro.slice());
                pro.length = 0;
                pro.push(group);
            }
        }
    });

    await Promise.all(pro);
}

if (can_clone) (async () => {
    const b1 = await connect(b1t);
    const b2 = await connect(b2t);

    while (true) {
        await do_clone(b1, b2);
        if (interval) {
            await new Promise(resolve => setTimeout(resolve, interval));
            continue;
        } else {
            break;
        }
    }

    await b1.close();
    await b2.close();
    process.exit();

}) ();
