#!/usr/bin/env node

const { stdin: input, stdout: output } = require('node:process');
const cmdline = require('node:readline/promises').createInterface({ input, output });
const LineBuffer = require('./util').LineBuffer;
const { evil } = require('./util');
const fs = require('fs-extra');
const args = require('minimist')(process.argv.slice(2));
const host = args.host || 'localhost';
const port = parseInt(args.port || 3000);
const user = args.user || undefined;
const pass = args.pass || undefined;
const base = args.base || undefined;
const subs = args.subs || args.sub || undefined;
const retries = args.retry || 5;
const client = new (require('../index').client)({ retries });

let verbose = !args.quiet;
let exiting = false;
let promise;
let limit;

if (verbose) {
    console.log('[ grid.space net level client 1.2 ]');
}

function onerror(error) {
    console.log(error);
    process.exit(1);
}

if (host) {
    promise = client.open(host, port);
    if (user) {
        promise = promise.then(() => client.auth(user, pass));
    }
    if (base) {
        promise = promise.then(() => client.use(base));
    }
    if (subs) {
        promise = promise.then(() => client.sub(subs.split(',')));
    }
    promise = promise.catch(onerror);
}

function prompt(reply) {
    if (reply && reply.error) {
        console.log(reply.error);
    }
    if (exiting) {
        process.exit();
    }
    if (verbose) {
        cmdline.question(`:${client.path.join('/')}: `).then(nextCmd);
    } else {
        cmdline.question(``).then(nextCmd);
    }
}

function error(scope) {
    return function (error) {
        console.log({ [`${scope}_error`]: error });
        prompt();
    };
}

if (promise) {
    promise.then(prompt).then(start);
} else {
    prompt();
    start();
}

function start() {
    process.stdin.on('close', () => {
        exiting = true;
    });
}

async function help_user() {
    console.log(
        [
            'add  [user] <perm>   - add user with optional permissions',
            '            <perm>   - { pass, use, create, drop, get, put, del, stat, halt, range }',
            'base [user] <perm>   - set user datastore permissions',
            '            <perm>   - { drop, get, put, del, stat, range }',
            'del  [user]          - delete user',
            'list                 - list all users',
            'list [user]          - show user details',
            'pass [user] [pass]   - set user password',
            'perm [user] <perm>   - set user general permissions',
            '            <perm>   - { use, create, drop, get, put, del, stat, halt, range }'
        ].join('\n')
    );
}

async function help_dump() {
    console.log(
        [
            'dump                 - dump entire base into file "dump.base"',
            'dump <opts>          - opts config object',
            '     <opts>          - { gt, gte, lt, lte, file }'
        ].join('\n')
    );
}

async function help() {
    const args = [...arguments];
    if (args.length) {
        switch (args[0]) {
            case 'user':
                return help_user();
            case 'dump':
                return help_dump();
        }
    }
    console.log(
        [
            'auth  [user] [pass]      - authenticate connection with server',
            'clear <opt>              - delete entries in range provided',
            'close                    - disconnect client from network server',
            'count [from] <to>        - count entries in range provided',
            'cull  [from] <to>        - delete entries in range provided',
            'debug [base] [0|1]       - disable or enable debugging for a data store',
            'del   [key]              - delete single value from active data store',
            'drop  [base]             - drop a database (cannot be in use)',
            'dump  <opt>              - dump base to file with optional <opts>',
            'get   [key] <opt>        - get single value from active data store',
            'keys  [from] <to>        - list keys in range provided (capped by limit)',
            'limit [num]              - limit range queries to [num] max entries',
            'list  [from] <to>        - list entries in range provided (capped by limit)',
            'load  [file]             - load values from dump [file] into current base',
            'more                     - next [limit] entries from previous list command',
            'open  [host] <port>      - connect client to a network server',
            'put   [key] [val] <opt>  - put single key/value pair into active data store',
            'stat  [cmd] <opt>        - get server or data store stats (with auth)',
            'sub   [path] <opt>       - navigate to a database sublevel',
            'use   [base] <opt>       - make data store active (create with auth)',
            'user  [cmd] <opt>        - get or set user info (with auth)',
            'help  [command]          - command help'
        ].join('\n')
    );
}

const CLI = {
    help,

    async open(host, port) {
        return client.close().open(host || client.host, parseInt(port || client.port));
    },

    auth: client.auth.bind(client),

    async stat(name) {
        let opts = {};
        if (name) {
            if (name.charAt(0) === '*') {
                opts.list = name.substring(1);
            } else {
                opts.name = name;
            }
        }
        return client.stat(opts).then((stat) => {
            if (Array.isArray(stat)) {
                stat = stat.join('\n');
            }
            if (stat) {
                console.log(stat);
            }
            prompt();
        });
    },

    async use(base, opts) {
        try {
            opts = eval(`(${opts})`);
        } catch (err) {
            opts = { valueEncoding: opts || undefined };
        }
        typeof opts === 'string' && (opts = { valueEncoding: opts });
        return client.use(base, opts).then((rec) => (this.path = rec ? rec.path : []));
    },

    async user(name, pass, opts) {
        return client.user(name, pass, evil(opts)).then((reply) => {
            reply && console.log(reply);
        });
    },

    async debug(key, value) {
        return client.debug(key, eval(`(${value})`));
    },

    async load(file) {
        if (!file) {
            console.log({ load_missing_filename: file });
            return;
        }
        if (!client.isOpen()) {
            console.log({ error: 'client_not_open' });
            return;
        }
        let loaded = 0;
        let stream = fs.createReadStream(file);
        new LineBuffer(stream, (line) => {
            let [key, value] = JSON.parse(line.toString());
            client.put(key, value);
            loaded++;
        });
        return new Promise((resolve, reject) => {
            stream.on('error', (error) => {
                console.log({ load_error: error });
                reject(error);
            });
            stream.on('close', () => {
                console.log({ loaded });
                resolve();
            });
        });
    },

    halt: client.halt.bind(client),

    drop: client.drop.bind(client),

    close: client.close.bind(client),

    async del(key) {
        const val = await client.get(key);
        if (val === undefined) {
            console.log({ deleted: 0 });
            return;
        }
        return client.del(key)
            .then(res => {
                console.log({ deleted: 1 });
            })
            .catch(error => {
                console.log({ error });
            });
    },

    async sub(sub, opts) {
        return client.sub(sub, evil(opts));
    },

    async cull(gte, lt) {
        return CLI.clear({ gte, lt });
    },

    async clear(opts) {
        return client.clear(evil(opts));
    },

    async limit(num = 0) {
        limit = parseInt(num) || undefined;
    },

    async get(key, opt) {
        return client.get(key, evil(opt)).then((reply) => console.log(reply));
    },

    async put(key, val, opt) {
        return client.put(key, evil(val), evil(opt));
    },

    async dump(opts = {}) {
        opts = evil(opts);
        let count = 0;
        const outFile = fs.openSync(opts.file || 'dump.base', opts.mode || 'w');
        return client
            .list(opts, (key, value) => {
                console.log('dump', key, value);
                console.log({ outFile });
                fs.writeSync(outFile, JSON.stringify([key, value]));
                fs.writeSync(outFile, '\n');
                count++;
            })
            .then(() => {
                fs.closeSync(outFile);
                console.log({ count });
            });
    },

    async count(opts = {}) {
        const args = [...arguments].map(v => evil(v));
        if (args.length === 0) {
            opts = {};
        } else if (typeof(args[0]) === 'string') {
            opts = { gte: args[0], lt: args[1] };
        } else {
            opts = args[0];
        }
        return CLI.list(Object.assign(opts, { count: true, values: false }));
    },

    async keys(opts = {}) {
        const args = [...arguments].map(v => evil(v));
        if (args.length === 0) {
            opts = {};
        } else if (typeof(args[0]) === 'string') {
            opts = { gte: args[0], lt: args[1] };
        } else {
            opts = args[0];
        }
        return CLI.list(Object.assign(opts, { values: false }));
    },

    async list(opts = {}) {
        let count = 0;
        opts = { limit, ...evil(opts) };
        return client
            .list(opts, (key, value) => {
                if (opts.values !== false) {
                    console.log({ key, value });
                } else if (!opts.count) {
                    console.log({ key });
                }
                count++;
            })
            .then(() => {
                console.log({ count });
            });
    },

    more() {
        return client.more();
    },

    async exit() {
        exiting = true;
    },

    async quit() {
        return CLI.exit();
    }
};

function nextCmd(line) {
    const args = line
        .toString()
        .trim()
        .split(' ')
        .map((v) => v.trim());
    const cmd = args.shift();
    const fn = CLI[cmd];
    if (fn) {
        return fn(...args)
            .then(prompt)
            .catch(error(cmd));
    }
    if (cmd) console.log({ invalid_command: cmd });
    prompt();
}
