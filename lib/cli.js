#!/usr/bin/env node

const { stdin: input, stdout: output } = require('node:process');
const cmdline = require('node:readline/promises').createInterface({ input, output });
const LineBuffer = require('./util').LineBuffer;
const { evil } = require('./util');
const fs = require('fs');
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
let limit = undefined;
let promise;

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

function parse(str, def) {
    try {
        return JSON.parse(str);
    } catch (e) {
        console.log({ parse_error: e, string: str });
        return def;
    }
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
            'list                   - list all users',
            "list  [user]           - show user's details",
            'add   [user] <perms>   - add user with optional permissions',
            '             <perms>   - { pass, use, create, drop, get, put, del, stat, halt, range }',
            'del   [user]           - delete user',
            "pass  [user] [pass]    - set user's password",
            "perm  [user] <perms>   - set user's general permissions",
            '             <perms>   - { use, create, drop, get, put, del, stat, halt, range }',
            "base  [user] <perms>   - set user's datastore permissions",
            '             <perms>   - { drop, get, put, del, stat, range }'
        ].join('\n')
    );
}

async function help_dump() {
    console.log(
        [
            "dump                   - dump entire base into 'dump.base'",
            'dump  <opts>           - opts config object',
            '      <opts>           - { gt, gte, lt, lte, file }'
        ].join('\n')
    );
}

async function help() {
    const args = [...arguments];
    if (args.length) {
        switch (args[0]) {
            case 'user':
                return help_user(args.slice(1));
            case 'dump':
                return help_dump(args.slice(1));
        }
    }
    console.log(
        [
            'auth   [user]  [pass]   - authenticate connection with server',
            'drop   [base]           - drop a database (cannot be in use)',
            'debug  [base]  [0|1]    - disable or enable debugging for a data store',
            'open   [host]  <port>   - connect client to a network server',
            'close                   - disconnect client from network server',
            'stat   [cmd]   <opts>   - get server or data store stats (with auth)',
            'user   [cmd]   <opts>   - get or set user info (with auth)',
            'use    [base]  <opts>   - make data store active (create with auth)',
            'sub    [path]           - navigate to a database sublevel',
            "get    [key]            - fetch key's value from active data store",
            'put    [key]   [value]  - put key/value pair into active data store',
            "del    [key]            - delete key's value from active data store",
            'list   [from]  <to>     - list entries in range provided (capped by limit)',
            'more                    - next [limit] entries from last list',
            'clear  <opts>           - delete entries in range provided',
            'cull   [from]  <to>     - delete entries in range provided',
            'keys   [from]  <to>     - list keys in range provided (capped by limit)',
            'count  [from]  <to>     - count entries in range provided',
            'limit  [count]          - limit range queries to [count] max entries',
            'dump   <opts>           - dump base to file with optional <opts>',
            'load   [file]           - load values from dump [file] into current base',
            'help   [command]        - command help'
        ].join('\n')
    );
}

const CLI = {
    help,

    open: async function (host, port) {
        return client.close().open(host || client.host, parseInt(port || client.port));
    },

    auth: client.auth.bind(client),

    stat: async function (name) {
        let opts = {};
        if (name) {
            if (name.charAt(0) === '*') {
                opts.list = name.substring(1);
            } else {
                opts.name = name;
            }
        }
        return client.stat(opts).then((reply) => {
            let stat = reply.stat;
            if (Array.isArray(stat)) {
                stat = stat.join('\n');
            }
            if (stat) {
                console.log(stat);
            }
            prompt();
        });
    },

    use: async function (base, opts) {
        let enc = opts ? { valueEncoding: opts === 'none' ? undefined : opts } : undefined;
        return client.use(base, enc).then((rec) => (this.path = rec ? rec.path : []));
    },

    user: async function (name, pass, opts) {
        return client.user(name, pass, evil(opts)).then((reply) => {
            if (reply.list || reply.rec) {
                console.log(reply.list || reply.rec);
            }
        });
    },

    debug: async function (key, value) {
        return client.debug(key, eval(`(${value})`));
    },

    load: async function (file) {
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

    del: client.del.bind(client),

    sub: client.sub.bind(client),

    clear: client.clear.bind(client),

    limit: async function (num = 0) {
        limit = parseInt(num);
    },

    get: async function (key, opt) {
        return client.get(key).then((reply) => {
            if (opt) {
                console.log(enhancedGet(opt, reply));
            } else {
                console.log(reply);
            }
        });
    },

    put: async function (key, val) {
        return client.put(key, eval(`(${val})`));
    }
};

function nextCmd(line) {
    let ls = {};
    let tline = line.toString().trim();
    line = tline.split(' ').map((v) => v.trim());
    let cmd = line.shift();
    let fn = CLI[cmd];
    if (fn) {
        fn(...line)
            .then(prompt)
            .catch(error(cmd));
        return;
    }
    switch (cmd) {
        case 'ls':
            ls = {};
        case 'count':
        case 'list':
        case 'keys':
        case 'more':
        case 'dump':
        case 'cull': {
            let isDump = cmd === 'dump';
            let isMore = cmd === 'more';
            let isCull = cmd === 'cull';
            let isLS = cmd === 'ls';
            let isCount = cmd === 'count';
            let isKeys = cmd === 'keys' || isCount || isLS || isCull;
            let opt = isDump
                ? parse(tline.substring(5).trim() || '{}')
                : line.length === 1 || isLS
                  ? { pre: line[0] }
                  : { gte: line[0], lt: line[1] };
            if (typeof opt !== 'object') {
                console.log({ invalid_dump_options: opt });
                prompt();
                break;
            }
            opt.del = isCull ? true : undefined;
            let outFile = isDump ? fs.openSync(opt.file || 'dump.base', opt.mode || 'w') : undefined;
            let onRow = isDump
                ? function (key, value) {
                      console.log('dump', key, value);
                      fs.writeSync(outFile, JSON.stringify([key, value]));
                      fs.writeSync(outFile, '\n');
                      count++;
                  }
                : function (key, value) {
                      count++;
                      if (!isCount) {
                          if (isLS) {
                              let kv = (line[0] ? key.substring(line[0].length) : key).split('/')[0];
                              if (kv.length === 0) {
                                  return;
                              }
                              if (!ls[kv]) {
                                  console.log(kv);
                                  ls[kv] = 1;
                              } else {
                                  ls[kv]++;
                              }
                          } else {
                              console.log(isKeys ? key : { key, value });
                          }
                      }
                  };
            let onDone = function () {
                if (isLS) {
                    for (let key in ls) {
                        if (ls[key] === 1) {
                            delete ls[key];
                        }
                    }
                    if (Object.keys(ls).length) {
                        console.log(ls);
                    }
                }
                if (outFile) {
                    fs.closeSync(outFile);
                }
                console.log({ count });
                prompt();
            };
            let count = 0;
            if (isMore) {
                client.more().then(onDone).catch(error(cmd));
            } else {
                let arg = Object.assign({ values: isKeys ? false : true, limit }, opt);
                client.list(arg, onRow).then(onDone).catch(error(cmd));
            }
            break;
        }
        case 'exit':
        case 'quit':
            exiting = true;
        case '': {
            prompt();
            break;
        }
        default: {
            console.log({ invalid_command: cmd });
            prompt();
            break;
        }
    }
}

function enhancedGet(directive, value) {
    let attributes = directive.split('.');
    attributes.forEach((attribute) => {
        if (typeof value === 'object') {
            let root = attribute.split('[')[0];
            value = value[root];
            if (Array.isArray(value)) {
                let getBracketedValues = /(?<=\[).*?(?=\])/g;
                let bracketedValues = attribute.match(getBracketedValues);
                if (Array.isArray(bracketedValues)) {
                    bracketedValues.forEach((bracketedValue) => {
                        value = value[bracketedValue];
                    });
                }
            }
        }
    });
    return value;
}
