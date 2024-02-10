#!/usr/bin/env node

const fs = require('fs');
const net = require('net');
const { Level } = require('level');
const { LineBuffer, encode, decode, lastmod, clone, evil, log } = require('./util');
require('dotenv').config();

const defperms = {
    halt: false,
    stat: false,
    drop: false,
    user: false,
    create: false,
    use: false,
    get: false,
    put: false,
    del: false,
    range: 0
};

function validName(n) {
    return n.indexOf('.') < 0 && n.indexOf('/') < 0;
}

function init(args = { _: [] }) {
    if (args._ && args._.indexOf('help') >= 0) {
        console.log(
            [
                'server <args>',
                '  --user=[user]     seed admin user',
                '  --pass=[pass]     seed admin password',
                '  --port=[port]     listen on port (default 3000)',
                "  --dir=[dir]       data directory (default 'data')"
            ].join('\n')
        );
        process.exit();
    }

    let uname = process.env.DB_USER || args.user || 'user';
    let upass = process.env.DB_PASS || args.pass || Date.now().toString(36) + (Math.random() * 0xffffff).toString(36);
    let port = parseInt(process.env.DB_PORT || args.port || 3000);
    let host = args.host || undefined;
    let ddir = process.env.DB_BASE || args.dir || args.base || 'data';
    let udbf = `${ddir}/.users`;
    let nuid = Date.now();
    let users = {};
    let base = {};
    let dbug = {};
    let gets = 0;
    let puts = 0;
    let dels = 0;
    let iter = 0;

    if (!lastmod(ddir)) {
        fs.mkdirSync(ddir);
    }
    if (lastmod(udbf)) {
        let cnf = evil(fs.readFileSync(udbf).toString());
        for (let [uname, urec] of Object.entries(cnf)) {
            users[uname] = urec;
            console.log({ load_user: uname });
        }
    }

    function saveUsers() {
        fs.writeFileSync(udbf, JSON.stringify(users, undefined, 4));
    }

    users[uname] = {
        pass: args.pass || upass,
        perms: {
            halt: true,
            stat: true,
            drop: true,
            user: true,
            create: true,
            use: true,
            get: true,
            put: true,
            del: true,
            range: Infinity
        }
    };

    log(`starting net-level on port ${port} serving "${ddir}"`);

    function on_conn(conn) {
        const state = {
            addr: conn.remoteAddress,
            mark: Date.now(),
            uuid: nuid++,
            unam: 'unknown',
            name: undefined,
            urec: undefined,
            rec: undefined,
            db: undefined,
            perms: clone(defperms),
            rmdir,
            close,
            check
        };

        function close(rec) {
            if (rec) {
                let uids = rec.uids;
                let pos = uids.indexOf(state.uuid);
                if (pos >= 0) {
                    uids.splice(pos, 1);
                }
                if (uids.length === 0) {
                    if (state.db) {
                        state.db.close();
                    }
                    state.db = undefined;
                    delete base[state.name];
                }
            }
        }

        function check(call) {
            if (!state.db) {
                conn.write(encode({ call, error: 'no database in use' }));
                return false;
            }
            return true;
        }

        function rmdir(dir, then) {
            fs.readdir(dir, (error, files) => {
                rmfiles(dir, files, then);
            });
        }

        function rmfiles(dir, files, then) {
            if (files.length) {
                let file = files.shift();
                fs.unlink(`${dir}/${file}`, (error) => {
                    if (error) {
                        then(error);
                    } else {
                        deleteFiles(dir, files, then);
                    }
                });
            } else {
                fs.rmdir(dir, (error) => {
                    then(error);
                });
            }
        }

        conn.on('close', () => close(state.rec));
        conn.on('error', (error) => log({ error }));

        new LineBuffer(conn, line => on_line(conn, state, line));
    }

    function on_line(conn, state, line) {
        let json;
        try {
            json = decode(line);
        } catch (e) {
            console.log({ socket_close_on_invalid_request: line.toString(), from: conn.remoteAddress });
            conn.destroy();
            return;
        }

        const { call, stat, user, cmd, auth, pass, halt, drop, debug } = json;
        const { use, get, put, del, list, opt = {}, value } = json;
        const { addr, mark, uuid, check } = state;

        let { db, rec, urec, unam, name, perms } = state;

        if (halt && perms.halt) {
            server.close();
            for (const rec of Object.values(base)) {
                state.close(rec);
            }
            conn.write(encode({ call, halt }));
            process.exit();
        } else if (stat && perms.stat) {
            fs.readdir(ddir, (err, list) => {
                let stat = {
                    open: Object.keys(base),
                    list: list.filter(validName),
                    mark,
                    gets,
                    puts,
                    dels,
                    iter,
                    dbug
                };
                if (opt.list) {
                    stat = stat[opt.list];
                } else if (opt.name) {
                    stat = base[opt.name] || undefined;
                    if (stat) {
                        let { uids, gets, puts, dels, iter } = stat;
                        let { options } = stat.db;
                        stat = { uids, gets, puts, dels, iter, options };
                    }
                }
                conn.write(encode({ call, stat }));
            });
        } else if (user && perms.user) {
            console.log({ user, cmd, opt });
            // conn.write(encode({call, user}));
            switch (user) {
                case 'add':
                    if (!users[cmd]) {
                        users[cmd] = opt || {
                            pass: '',
                            perms: clone(defperms)
                        };
                    } else {
                        return conn.write(encode({ call, user, error: 'user exist' }));
                    }
                    break;
                case 'del':
                    if (users[cmd]) {
                        delete users[cmd];
                    } else {
                        return conn.write(encode({ call, user, error: 'no such user' }));
                    }
                    break;
                case 'pass':
                    if (users[cmd]) {
                        users[cmd].pass = opt;
                    } else {
                        return conn.write(encode({ call, user, error: 'no such user' }));
                    }
                    break;
                case 'perm':
                case 'perms':
                    if (users[cmd]) {
                        users[cmd].perms = Object.assign(users[cmd].perms || {}, opt);
                    } else {
                        return conn.write(encode({ call, user, error: 'no such user' }));
                    }
                    break;
                case 'base':
                    if (users[cmd]) {
                        users[cmd].base = Object.assign(users[cmd].base || {}, opt);
                    } else {
                        return conn.write(encode({ call, user, error: 'no such user' }));
                    }
                    break;
                case 'list':
                    if (cmd) {
                        let rec = users[cmd];
                        if (rec) {
                            return conn.write(encode({ call, user, rec }));
                        } else {
                            return conn.write(encode({ call, user, error: 'no such user' }));
                        }
                    } else {
                        return conn.write(encode({ call, user, list: Object.keys(users) }));
                    }
            }
            conn.write(encode({ call, user }));
            saveUsers();
        } else if (drop && perms.drop) {
            let dropdir = `${ddir}/${drop}`;
            if (base[drop]) {
                conn.write(encode({ call, drop, error: 'database in use' }));
            } else if (lastmod(dropdir)) {
                state.rmdir(dropdir, (error) => {
                    conn.write(encode({ call, drop, error }));
                });
            } else {
                conn.write(encode({ call, drop, error: 'no such database' }));
            }
        } else if (auth) {
            urec = state.urec = users[auth];
            if (urec && urec.pass === pass) {
                perms = state.perms = urec.perms;
                state.dbperms = {};
                log({ addr, auth, perms });
            } else {
                perms = state.perms = defperms;
            }
            unam = state.unam = auth;
            conn.write(encode({ call, auth }));
        } else if (use) {
            if (!(perms.use || (urec && urec.base && urec.base[use] && urec.base[use].use))) {
                return conn.write(encode({ call, use, error: 'not authorized' }));
            }
            if (!validName(use)) {
                return conn.write(encode({ call, use, error: 'invalid name' }));
            }
            state.close(rec);
            if (Array.isArray(use) && use.length === 1 && use[0] === 42) {
                rec = undefined;
                return conn.write(encode({ call, use }));
            }
            name = state.name = use;
            rec = state.rec = base[use];
            state.dbperms = urec && urec.base ? urec.base[use] || {} : {};
            let path = `${ddir}/${use}`;
            if (rec) {
                db = state.db = rec.db;
                if (rec.uids.indexOf(uuid) < 0) {
                    rec.uids.push(uuid);
                }
                conn.write(encode({ call, use }));
                log({ addr, user: unam, open: path });
            } else if (lastmod(path) || perms.create) {
                if (!opt.valueEncoding) {
                    opt.valueEncoding = 'json';
                }
                db = state.db = new Level(path, opt);
                db.on('error', (error) => {
                    console.log({ db_error: error });
                    state.close(base[use]);
                });
                rec = state.rec = base[use] = {
                    uids: [uuid],
                    gets: 0,
                    puts: 0,
                    dels: 0,
                    iter: 0,
                    db
                };
                conn.write(encode({ call, use }));
                log({ addr, user: unam, open: path });
            } else {
                conn.write(encode({ call, use, error: 'not authorized' }));
            }
        } else if (get) {
            if (!(perms.get || state.dbperms.get)) {
                return conn.write(encode({ call, get, error: 'not authorized' }));
            }
            if (check(call))
                db.get(get, (error, value) => {
                    if (error && error.notFound) {
                        error = undefined;
                        value = undefined;
                    }
                    conn.write(encode({ call, get, value, error }));
                    if (dbug[name]) {
                        log({ addr, name, user: unam, get, error });
                    }
                    rec.gets++;
                    gets++;
                });
        } else if (put) {
            if (!(perms.put || state.dbperms.put)) {
                return conn.write(encode({ call, put, error: 'not authorized' }));
            }
            if (check(call))
                db.put(put, value, (error) => {
                    conn.write(encode({ call, put, error }));
                    if (dbug[name]) {
                        log({ addr, name, user: unam, put, error });
                    }
                    rec.puts++;
                    puts++;
                });
        } else if (del) {
            if (!(perms.del || state.dbperms.del)) {
                return conn.write(encode({ call, put, error: 'not authorized' }));
            }
            if (check(call))
                db.del(del, (error) => {
                    conn.write(encode({ call, del, error }));
                    if (dbug[name]) {
                        log({ addr, name, user: unam, del, error });
                    }
                    rec.dels++;
                    dels++;
                });
        } else if (list) {
            if (!(perms.range || state.dbperms.range)) {
                return conn.write(encode({ call, list, error: 'not authorized' }));
            }
            let range = Math.max(perms.range || 0, state.dbperms.range || 0);
            let read = 0;
            if (!check(call)) {
                return;
            }
            rec.iter++;
            iter++;
            let pre = opt.pre;
            if (pre) {
                opt.gte = pre;
            }
            let batch = opt.del ? db.batch() : undefined;
            (async function() {
                try {
                    let cont = true;
                    for await (const [ key, value ] of db.iterator(opt)) {
                        if (pre && !key.startsWith(pre)) {
                            break;
                        }
                        if (read++ >= range) {
                            cont = false;
                        }
                        conn.write(encode({ call, list: { key, value }, continue: cont }));
                        if (batch) {
                            batch.del(key);
                            rec.dels++;
                            dels++;
                        }
                        if (!cont) {
                            break;
                        }
                    }
                } catch (error) {
                    conn.write(encode({ call, error }));
                } finally {
                    conn.write(encode({ call }));
                    if (batch) {
                        batch.write();
                    }
                    if (dbug[name]) {
                        log({ addr, name, user: unam, list: opt, read });
                    }
                }
            })();
        } else if (debug) {
            dbug[debug] = value;
            conn.write(encode({ call, debug }));
        } else {
            conn.write(encode({ call, error: 'no command' }));
        }
    }

    const server = net.createServer(on_conn).listen(port, host);
}

if (module.parent) {
    module.exports = init;
} else {
    init(require('minimist')(process.argv.slice(2)));
}
