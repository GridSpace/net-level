#!/usr/bin/env node

const fs = require('fs-extra');
const net = require('net');
const { Level } = require('level');
const { LineBuffer, encode, decode, lastmod, clone, evil, hash, log } = require('./util');

require('dotenv').config();

const no_perms = {
    halt: false,
    stat: false,
    drop: false,
    user: false,
    create: false,
    use: false,
    get: false,
    put: false,
    del: false,
    range: false
};

const def_user_perms = {
    halt: false,
    stat: true,
    drop: false,
    user: false,
    create: false,
    use: true,
    get: true,
    put: false,
    del: false,
    range: true
};

function validName(n) {
    return n.indexOf('.') < 0 && n.indexOf('/') < 0;
}

class LevelServer {
    #server = undefined;
    #host = 'localhost';
    #port = 3000;
    #ddir = 'data';
    #udbf = 'data/.users';
    #nuid = Date.now();
    #debug = false;
    #admins = [];
    #users = {};
    #base = {};
    #dbug = {};
    #stats = {
        gets: 0,
        puts: 0,
        dels: 0,
        iter: 0
    };

    constructor(opts = {}) {
        this.#host = opts.host || this.#host;
        this.#port = opts.port ? parseInt(opts.port) : this.#port;
        this.#ddir = opts.dir || this.#ddir;
        this.#udbf = `${this.#ddir}/.users`;
        this.#debug = opts.debug || false;

        fs.mkdirSync(this.#ddir, { recursive: true });
        this.#users_load();

        // seed user when provided
        const { user, pass, pash } = opts;
        if (user) {
            this.#users[user] = {
                pash: pash || hash(pass || ''),
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
                    range: true
                }
            };
            this.#users_save();
        }

        this.#start_server();
    }

    #start_server() {
        if (!this.#server) {
            const on_conn = this.#on_conn.bind(this);
            const server = net.createServer(on_conn).listen(this.#port, this.#host);
            server.on('error', (error) => {
                console.log({ error });
                process.exit(1);
            });
            this.#server = server;
            log(`starting net-level on port ${this.#port} serving "${this.#ddir}"`);
        } else {
            log('attempt to start a running sever');
        }
    }

    #on_conn(conn) {
        const server = (conn.server = this);

        const state = (conn.state = {
            addr: conn.remoteAddress,
            mark: Date.now(),
            uuid: this.#nuid++,
            unam: 'unknown',
            urec: undefined,
            dnam: undefined,
            drec: undefined,
            path: [],
            db: undefined,
            perms: clone(no_perms),
            close,
            check
        });

        function close(drec) {
            if (drec) {
                let uids = drec.uids;
                let pos = uids.indexOf(state.uuid);
                if (pos >= 0) {
                    uids.splice(pos, 1);
                }
                if (uids.length === 0) {
                    if (state.db) {
                        state.db.close();
                    }
                    state.path = [];
                    state.db = undefined;
                    delete server.#base[state.dnam];
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

        conn.on('close', () => close(state.drec));
        conn.on('error', (error) => log({ error }));

        const on_line = this.#on_line.bind(this);
        new LineBuffer(conn, (line) => on_line(conn, state, line));
    }

    #cmd_halt(conn, call, halt) {
        const { server } = conn;
        server.close();
        for (const rec of Object.values(server.#base)) {
            conn.state.close(rec);
        }
        conn.write(encode({ call, halt }));
        log('halting');
        process.exit();
    }

    #cmd_stat(conn, call, opt) {
        const { server } = conn;
        fs.readdir(server.#ddir, (err, list) => {
            let stat = {
                open: Object.keys(server.#base),
                list: list.filter(validName),
                mark: conn.state.mark,
                gets: server.#stats.gets,
                puts: server.#stats.puts,
                dels: server.#stats.dels,
                iter: server.#stats.iter,
                dbug: server.#dbug
            };
            if (opt.list) {
                stat = stat[opt.list];
            } else if (opt.name) {
                stat = server.#base[opt.name] || undefined;
                if (stat) {
                    let { uids, gets, puts, dels, iter } = stat;
                    let { options } = stat.db;
                    stat = { uids, gets, puts, dels, iter, options };
                }
            }
            conn.write(encode({ call, stat }));
        });
    }

    #cmd_user(conn, call, user, cmd, opt) {
        // everyone is a user admin if no one is
        if (this.#debug) {
            console.log({ user, cmd, opt });
        }
        const users = this.#users;
        switch (user) {
            case 'add':
                if (!users[cmd]) {
                    const perms = Object.assign(clone(def_user_perms), opt);
                    const pass = perms.pass;
                    delete perms.pass;
                    const pash = hash(pass || '');
                    users[cmd] = { pash, perms };
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
                    users[cmd].pash = hash(opt);
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
        this.#users_save();
    }

    #cmd_drop(conn, call, drop) {
        const { server } = conn;
        let dropdir = `${server.#ddir}/${drop}`;
        if (server.#base[drop]) {
            conn.write(encode({ call, drop, error: 'database in use' }));
        } else if (lastmod(dropdir)) {
            fs.remove(dropdir, (error) => {
                conn.write(encode({ call, drop, error }));
            });
        } else {
            conn.write(encode({ call, drop, error: 'no such database' }));
        }
    }

    #cmd_auth(conn, call, auth, pass) {
        const { state, server } = conn;
        const urec = (state.urec = server.#users[auth]);
        const pash = hash(pass || '');
        if (urec && urec.pash === pash) {
            state.perms = urec.perms;
            state.dbperms = {};
            log({ addr: state.addr, auth, perms: state.perms });
        } else {
            state.perms = no_perms;
        }
        state.unam = auth;
        conn.write(encode({ call, auth }));
    }

    #cmd_use(conn, call, use, opt) {
        const { state, server } = conn;
        const { addr, perms, urec, unam, uuid } = state;
        if (!(perms.use || (urec && urec.base && urec.base[use] && urec.base[use].use))) {
            return conn.write(encode({ call, use, error: 'not authorized' }));
        }
        if (!validName(use)) {
            return conn.write(encode({ call, use, error: 'invalid name' }));
        }
        state.close(state.drec);
        if (Array.isArray(use) && use.length === 1 && use[0] === 42) {
            state.drec = undefined;
            return conn.write(encode({ call, use }));
        }
        state.dnam = use;
        const drec = (state.drec = server.#base[use]);
        state.dbperms = urec && urec.base ? urec.base[use] || {} : {};
        let path = `${server.#ddir}/${use}`;
        if (drec) {
            const db = (state.db = drec.db);
            if (drec.uids.indexOf(uuid) < 0) {
                drec.uids.push(uuid);
            }
            state.path.length = 0;
            state.path.push(db);
            conn.write(encode({ call, use }));
            log({ addr, user: unam, open: path });
        } else if (lastmod(path) || perms.create) {
            if (!opt.valueEncoding) {
                opt.valueEncoding = 'json';
            }
            let db;
            try {
                db = state.db = new Level(path, opt);
            } catch (error) {
                conn.write(encode({ call, error }));
                return;
            }
            db.name = use;
            db.on('error', (error) => {
                console.log({ db_error: error });
                state.close(server.#base[use]);
            });
            state.drec = server.#base[use] = {
                uids: [uuid],
                gets: 0,
                puts: 0,
                dels: 0,
                iter: 0,
                db
            };
            state.path.length = 0;
            state.path.push(db);
            conn.write(encode({ call, use, path: state.path.map((p) => p.name) }));
            log({ addr, user: unam, open: path });
        } else {
            conn.write(encode({ call, use, error: 'not authorized' }));
        }
    }

    #cmd_sub(conn, call, sub) {
        const { state } = conn;
        const { check, path } = state;
        let { db } = state;
        if (!check(call)) {
            return;
        }
        const subs = Array.isArray(sub) ? sub : [sub];
        for (let sub of subs) {
            if (sub === '/') {
                path.length = 1;
            } else if (sub === '..') {
                if (path.length > 1) {
                    path.length--;
                }
            } else {
                const sl = db.sublevel(sub);
                sl.name = sub;
                path.push(sl);
            }
            db = state.db = path[path.length - 1];
        }
        conn.write(encode({ call, sub, path: path.map((p) => p.name) }));
    }

    #cmd_clear(conn, call, clear) {
        const { state } = conn;
        const { db, check, perms } = state;
        if (!(perms.del || state.dbperms.del)) {
            return conn.write(encode({ call, clear, error: 'not authorized' }));
        }
        if (!check(call)) {
            return;
        }
        let copt = {};
        try {
            copt = evil(clear);
        } catch (e) {
            conn.write(encode({ call, error: 'invalid clear options' }));
            return;
        }
        db.clear(copt);
        conn.write(encode({ call, clear }));
    }

    #cmd_get(conn, call, get) {
        const { server, state } = conn;
        const { addr, check, db, dnam, drec, perms, unam } = state;
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
                if (server.#dbug[dnam]) {
                    log({ addr, name: dnam, user: unam, get, error });
                }
                drec.gets++;
                server.#stats.gets++;
            });
    }

    #cmd_put(conn, call, put, value) {
        const { server, state } = conn;
        const { addr, check, db, dnam, drec, perms, unam } = state;
        if (!(perms.put || state.dbperms.put)) {
            return conn.write(encode({ call, put, error: 'not authorized' }));
        }
        if (check(call)) {
            db.put(put, value, (error) => {
                conn.write(encode({ call, put, error }));
                if (server.#dbug[dnam]) {
                    log({ addr, name: dnam, user: unam, put, error });
                }
                drec.puts++;
                server.#stats.puts++;
            });
        }
    }

    #cmd_del(conn, call, del) {
        const { server, state } = conn;
        const { addr, check, db, dnam, drec, perms, unam } = state;
        if (!(perms.del || state.dbperms.del)) {
            return conn.write(encode({ call, del, error: 'not authorized' }));
        }
        if (check(call))
            db.del(del, (error) => {
                conn.write(encode({ call, del, error }));
                if (server.#dbug[dnam]) {
                    log({ addr, name: dnam, user: unam, del, error });
                }
                drec.dels++;
                server.#stats.dels++;
            });
    }

    #cmd_list(conn, call, list, opt) {
        const { server, state } = conn;
        const { addr, check, db, dnam, drec, perms, unam } = state;
        if (!check(call)) {
            return;
        }
        const rangeperm = perms.range || state.dbperms.range || Infinity;
        if (rangeperm === false || rangeperm === 0) {
            return conn.write(encode({ call, list, error: 'not authorized' }));
        }
        let range = rangeperm === true ? Infinity : Math.max(rangeperm, perms.range || 0, state.dbperms.range || 0);
        if (range === 0) {
            return conn.write(encode({ call, list, error: 'not authorized' }));
        }
        let read = 0;
        drec.iter++;
        server.#stats.iter++;
        let pre = opt.pre;
        if (pre) {
            opt.gte = pre;
        }
        let batch = opt.del ? db.batch() : undefined;
        (async function () {
            try {
                let cont = true;
                for await (const [key, value] of db.iterator(opt)) {
                    if (pre && !key.startsWith(pre)) {
                        break;
                    }
                    if (read++ >= range) {
                        cont = false;
                    }
                    conn.write(encode({ call, list: { key, value }, continue: true }));
                    if (batch) {
                        batch.del(key);
                        drec.dels++;
                        server.#stats.dels++;
                    }
                    if (!cont) {
                        break;
                    }
                }
                conn.write(encode({ call }));
            } catch (error) {
                conn.write(encode({ call, error }));
            } finally {
                if (batch) {
                    batch.write();
                }
                if (server.#dbug[dnam]) {
                    log({ addr, name: dnam, user: unam, list: opt, read });
                }
            }
        })();
    }

    #on_line(conn, state, line) {
        let json;
        try {
            json = decode(line);
        } catch (e) {
            console.log({
                socket_close_on_invalid_request: line.toString(),
                from: conn.remoteAddress
            });
            conn.destroy();
            return;
        }

        const { call, stat, user, cmd, auth, pass, halt, drop, debug } = json;
        const { use, sub, clear, get, put, del, list, opt = {}, value } = json;
        const { perms } = state;

        if (halt && perms.halt) {
            this.#cmd_halt(conn, call, halt);
        } else if (stat && perms.stat) {
            this.#cmd_stat(conn, call, opt);
        } else if (user && (perms.user || this.#admins.length === 0)) {
            this.#cmd_user(conn, call, user, cmd, opt);
        } else if (drop && perms.drop) {
            this.#cmd_drop(conn, call, drop);
        } else if (auth) {
            this.#cmd_auth(conn, call, auth, pass);
        } else if (use) {
            this.#cmd_use(conn, call, use, opt);
        } else if (sub) {
            this.#cmd_sub(conn, call, sub);
        } else if (clear) {
            this.#cmd_clear(conn, call, clear);
        } else if (get) {
            this.#cmd_get(conn, call, get);
        } else if (put) {
            this.#cmd_put(conn, call, put, value);
        } else if (del) {
            this.#cmd_del(conn, call, del);
        } else if (list) {
            this.#cmd_list(conn, call, list, opt);
        } else if (debug) {
            this.#dbug[debug] = value;
            conn.write(encode({ call, debug }));
        } else {
            conn.write(encode({ call, error: 'no command' }));
        }
    }

    #users_load() {
        if (!lastmod(this.#udbf)) {
            return;
        }
        let mod = false;
        let cnf = evil(fs.readFileSync(this.#udbf).toString());
        for (let [uname, urec] of Object.entries(cnf)) {
            this.#users[uname] = urec;
            if (!urec.pash) {
                urec.pash = hash(urec.pass);
                delete urec.pass;
                mod = true;
            }
            if (urec.user) {
                this.#admins.push(urec);
            }
            if (this.#debug) {
                console.log({ load_user: uname });
            }
        }
        if (mod) {
            this.#users_save();
        }
    }

    #users_save() {
        fs.writeFileSync(this.#udbf, JSON.stringify(this.#users, undefined, 4));
    }
}

if (module.parent) {
    module.exports = LevelServer;
} else {
    const args = require('minimist')(process.argv.slice(2));

    if (args._?.indexOf('help') >= 0) {
        console.log(
            [
                'server <args>',
                '  --user=[user]     seed admin user (for prod use ENV)',
                '  --pass=[pass]     seed admin password (for prod use ENV)',
                '  --port=[port]     listen on port (default 3000)',
                "  --dir=[dir]       data directory (default 'data')"
            ].join('\n')
        );
        process.exit();
    }

    new LevelServer({
        host: args.host || 'localhost',
        port: args.port || parseInt(process.env.DB_PORT || 3000),
        dir: args.dir || args.base || process.env.DB_BASE || 'data',
        user: args.user || process.env.DB_USER || undefined,
        pass: args.pass || process.env.DB_PASS || undefined,
        pash: args.pash || process.env.DB_PASH || undefined
    });
}
