#!/usr/bin/env node

const fs = require('fs');
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
            this.#server = net.createServer(on_conn).listen(this.#port, this.#host);
            log(`starting net-level on port ${this.#port} serving "${this.#ddir}"`);
        } else {
            log('attempt to start a running sever');
        }
    }

    #on_conn(conn) {
        const server = this;

        const state = {
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
            rmdir,
            close,
            check
        };

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
                        rmfiles(dir, files, then);
                    }
                });
            } else {
                fs.rmdir(dir, (error) => {
                    then(error);
                });
            }
        }

        conn.on('close', () => close(state.drec));
        conn.on('error', (error) => log({ error }));

        const on_line = this.#on_line.bind(this);
        new LineBuffer(conn, (line) => on_line(conn, state, line));
    }

    #on_line(conn, state, line) {
        const server = this;

        let json;
        try {
            json = decode(line);
        } catch (e) {
            console.log({ socket_close_on_invalid_request: line.toString(), from: conn.remoteAddress });
            conn.destroy();
            return;
        }

        const { call, stat, user, cmd, auth, pass, halt, drop, debug } = json;
        const { use, sub, clear, get, put, del, list, opt = {}, value } = json;
        const { path, addr, mark, uuid, check } = state;
        const pash = hash(pass || '');

        let { db, drec, urec, unam, dnam, perms } = state;

        if (halt && perms.halt) {
            server.close();
            for (const rec of Object.values(server.#base)) {
                state.close(rec);
            }
            conn.write(encode({ call, halt }));
            log('halting');
            process.exit();
        } else if (stat && perms.stat) {
            fs.readdir(server.#ddir, (err, list) => {
                let stat = {
                    open: Object.keys(server.#base),
                    list: list.filter(validName),
                    mark,
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
        } else if (user && (perms.user || server.#admins.length === 0)) {
            // everyone is a user admin if no one is
            if (args.debug) {
                console.log({ user, cmd, opt });
            }
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
            saveUsers();
        } else if (drop && perms.drop) {
            let dropdir = `${server.#ddir}/${drop}`;
            if (server.#base[drop]) {
                conn.write(encode({ call, drop, error: 'database in use' }));
            } else if (lastmod(dropdir)) {
                state.rmdir(dropdir, (error) => {
                    conn.write(encode({ call, drop, error }));
                });
            } else {
                conn.write(encode({ call, drop, error: 'no such database' }));
            }
        } else if (auth) {
            urec = state.urec = server.#users[auth];
            if (urec && urec.pash === pash) {
                perms = state.perms = urec.perms;
                state.dbperms = {};
                log({ addr, auth, perms });
            } else {
                perms = state.perms = no_perms;
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
            state.close(drec);
            if (Array.isArray(use) && use.length === 1 && use[0] === 42) {
                drec = undefined;
                return conn.write(encode({ call, use }));
            }
            dnam = state.dnam = use;
            drec = state.drec = server.#base[use];
            state.dbperms = urec && urec.base ? urec.base[use] || {} : {};
            let path = `${server.#ddir}/${use}`;
            if (drec) {
                db = state.db = drec.db;
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
                drec =
                    state.drec =
                    server.#base[use] =
                        {
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
        } else if (sub) {
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
        } else if (clear) {
            if (!(perms.del || state.dbperms.del)) {
                return conn.write(encode({ call, put, error: 'not authorized' }));
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
                    if (server.#dbug[dnam]) {
                        log({ addr, name: dnam, user: unam, get, error });
                    }
                    drec.gets++;
                    server.#stats.gets++;
                });
        } else if (put) {
            if (!(perms.put || state.dbperms.put)) {
                return conn.write(encode({ call, put, error: 'not authorized' }));
            }
            if (check(call))
                db.put(put, value, (error) => {
                    conn.write(encode({ call, put, error }));
                    if (server.#dbug[dnam]) {
                        log({ addr, name: dnam, user: unam, put, error });
                    }
                    drec.puts++;
                    server.#stats.puts++;
                });
        } else if (del) {
            if (!(perms.del || state.dbperms.del)) {
                return conn.write(encode({ call, put, error: 'not authorized' }));
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
        } else if (list) {
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
                            dels++;
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
        } else if (debug) {
            server.#dbug[debug] = value;
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

    const server = new LevelServer({
        host: args.host || 'localhost',
        port: args.port || parseInt(process.env.DB_PORT || 3000),
        dir:  args.dir  || args.base || process.env.DB_BASE || 'data',
        user: args.user || process.env.DB_USER || undefined,
        pass: args.pass || process.env.DB_PASS || undefined,
        pash: args.pash || process.env.DB_PASH || undefined
    });
}
