#!/usr/bin/env node

let args = process.argv.slice(2);
let host = args.host || "localhost";
let port = parseInt(args.port || 3000);
let user = args.user || undefined;
let pass = args.pass || undefined;
let client = require('./client');

function onerror(error) {
	console.log({db_error: error});
}

console.log("[net-level-clone]");
if (args.length < 2) {
	console.log("usage: host/port/user/pass/base host/port/user/pass/base query");
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

function connect(rec) {
    return new Promise((resolve, reject) => {
        let db = new client();
        db.open(rec.host, rec.port)
            .then(() => {
                return db.auth(rec.user, rec.pass);
            })
            .then(() => {
                return db.use(rec.base);
            })
            .then(() => {
                console.log(rec);
                resolve(db);
            })
            .catch(reject);
    });
}
let b1 = parse(args[0]);
let b2 = parse(args[1]);
let q = eval(`(${args[2] || "{}"})`);
let clone = b1.host !== b2.host || b1.base !== b2.base;

connect(b1)
    .then(db => {
        b1 = db;
        return connect(b2);
    })
    .then(db => {
        b2 = db;
    })
    .then(() => {
        b1.list(q, (key, value) => {
            console.log({key, value});
            if (clone && key && value) {
                b2.put(key, value).then(() => {
                    console.log({put: key});
                }).catch(error => {
                    console.log({put_error: key});
                    b1.close();
                });
            }
        }).then(() => {
            b1.close();
            b2.close();
            process.exit();
        }).catch(error => {
            console.log(error);
        });
    });
