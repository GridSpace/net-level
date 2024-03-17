#!/usr/bin/env node

const args = process.argv.slice(2);
/*
let host = args.host || 'localhost';
let port = parseInt(args.port || 3000);
let user = args.user || undefined;
let pass = args.pass || undefined;
*/
const client = require('./client');

console.log('[net-level-clone]');
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

const b1t = parse(args[0]);
const b2t = parse(args[1]);

// for use in mode settings eval
const series = 1;

const q = eval(`(${args[2] || '{}'})`);
const clone = b1t.host !== b2t.host || b1t.base !== b2t.base;

if (clone) (async () => {
    const b1 = await connect(b1t);
    const b2 = await connect(b2t);

    // (time) series continues after last key from destination base
    // with the option to include that record again with overlap:true
    // which is useful when the last record will be updated several times
    // before being finalized and the next record written (streaming + historical)
    if (q.mode === series) {
        const lastkey = await b2.list({ reverse: true, limit: 1, values: false });
        if (lastkey && lastkey.length) {
            console.log({ lastkey: lastkey[0].key });
            if (q.overlap) {
                q.gte = lastkey[0].key;
            } else {
                q.gt = lastkey[0].key;
            }
            delete q.overlap;
            delete q.mode;
        }
    }

    const pro = [];

    await b1.list(q, (key, value) => {
        console.log({ get: key });
        if (key && value) {
            pro.push(b2.put(key, value)
                .then(() => {
                    console.log({ put: key });
                })
                .catch((/*error*/) => {
                    console.log({ put_error: key });
                    b1.close();
                })
            );
        }
    });

    Promise.all(pro).then(async () => {
        await b1.close();
        await b2.close();
        process.exit();
    });

}) ();
