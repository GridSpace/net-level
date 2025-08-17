#!/usr/bin/env node

const fs = require('fs-extra');
const net = require('net');
const http = require('node:http');
const WebSocket = require('ws');
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

async function pause(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class LevelServer {
    #server = undefined;
    #host = 'localhost';
    #port = 3000;
    #ddir = 'data';
    #udbf = 'data/.users';
    #bdbf = 'data/.bases';
    #nuid = Date.now();
    #uidname = {};
    #debug = false;
    #trace = false;
    #admins = [];
    #bases = {};
    #users = {};
    #base = {};
    #dbug = {};
    #stats = {
        gets: 0,
        puts: 0,
        dels: 0,
        iter: 0
    };
    #webdir = 'web';
    #webport = 4040;
    #webhost = '127.0.0.1';

    constructor(opts = {}) {
        this.#host = opts.host || this.#host;
        this.#port = opts.port ? parseInt(opts.port) : this.#port;
        this.#ddir = opts.dir || this.#ddir;
        this.#udbf = `${this.#ddir}/.users`;
        this.#debug = opts.debug || false;
        this.#webport = opts.webport || this.#webport;
        this.#webhost = opts.webhost || this.#webhost;
        this.#webdir = opts.webdir || this.#webdir;

        fs.mkdirSync(this.#ddir, { recursive: true });
        this.#bases_load();
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

        if (opts.mock) {
            this.#on_conn(opts.mock);
        } else {
            this.#start_server();
            this.#start_web();
        }
    }

    #start_web() {
        if (!this.#webport) {
            return;
        }
        const web_handler = require('express')()
            .use(this.#web_handler)
            .use(require('serve-static')(this.#webdir, { index: ['index.html'] }))
            .use((req, res) => {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            });
        const web = http.createServer(web_handler).listen(this.#webport, this.#webhost);
        const wss = new WebSocket.Server({ server: web });
        wss.on('connection', this.#wss_handler.bind(this));
        wss.on('error', (error) => log({ ws_serv_error: error }));
        wss.on('close', (close) => log({ ws_serv_close: close }));
        log(`starting web-server on port ${this.#webport}" serving "${this.#webdir}"`);
    }

    #web_handler(req, res, next) {
        next();
    }

    #wss_handler(ws, req) {
        if (req.url === '/ws') {
            ws.on('error', (error) => {
                console.log({ error });
            });
            ws.on('close', () => {
                event.close();
            });
            ws.on('message', (msg) => {
                queue.push(msg);
                event.readable();
            });
            // mock + monkey patch goodness
            const event = {};
            const queue = [];
            this.#on_conn({
                on(ev, fn) {
                    event[ev] = fn;
                },
                read() {
                    return queue.shift();
                },
                write(data) {
                    ws.send(data);
                },
                destroy() {}
            });
        } else {
            console.log({ ws_reject_conn: req.url });
            ws.close();
        }
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
            unam: undefined,
            urec: undefined,
            dnam: undefined,
            dinf: undefined,
            drec: undefined,
            list: {}, // active list commands
            path: [], // current sub path
            db: undefined,
            perms: clone(no_perms),
            check_perms,
            check_db,
            check_db_open,
            close
        });

        function close(drec) {
            if (drec) {
                let uids = drec.uids;
                let pos = uids.indexOf(state.uuid);
                if (pos >= 0) {
                    uids.splice(pos, 1);
                }
                // close base when last user of it disconnects
                if (uids.length === 0) {
                    if (state.db) {
                        state.db = state.path[0];
                        state.db.close();
                    }
                    state.path = [];
                    state.db = undefined;
                    delete server.#base[state.dnam];
                }
                server.#bases_save();
            }
        }

        function check_perms(send, bool) {
            if (!bool) {
                send({ error: 'not permitted' });
                return false;
            }
            return true;
        }

        function check_db(send) {
            if (!state.db) {
                send({ error: 'no database in use' });
                return false;
            }
            return true;
        }

        function check_db_open(send) {
            if (state.db.status.indexOf('open') !== 0) {
                send({ error: 'database closed' });
                return false;
            }
            return true;
        }

        conn.on('error', (error) => log({ error }));
        conn.on('close', () => {
            close(state.drec);
            delete this.#uidname[state.uuid];
        });

        const on_line = this.#on_line.bind(this);
        new LineBuffer(conn, (line) => on_line(conn, state, line));
    }

    #cmd_halt(conn, send, halt) {
        const { server } = conn;
        for (const rec of Object.values(server.#base)) {
            conn.state.close(rec);
        }
        send({ halt });
        log('halting');
        conn.destroy();
        process.exit();
    }

    async #cmd_stat(conn, send, opt) {
        const { server, state } = conn;
        const { perms } = state;
        if (!perms.stat) {
            return send({
                stat: {
                    path: state.path,
                    user: state.unam
                }
            });
        }
        const list = await fs.readdir(server.#ddir);
        let stat = {
            open: Object.keys(server.#base),
            list: list.filter(validName),
            mark: conn.state.mark,
            gets: server.#stats.gets,
            puts: server.#stats.puts,
            dels: server.#stats.dels,
            iter: server.#stats.iter,
            dbug: server.#dbug,
            path: state.path.map((db) => db.name),
            user: state.unam
        };
        if (opt.list) {
            stat = stat[opt.list];
        } else if (opt.name) {
            const drec = server.#base[opt.name];
            const dinf = server.#bases[opt.name] || {};
            if (drec) {
                const { uids, db } = drec;
                const { options } = db;
                const users = uids.map((uuid) => server.#uidname[uuid]);
                stat = { active: uids.length, options, users, ...dinf };
            } else {
                stat = { ...dinf };
            }
        }
        send({ stat });
    }

    #cmd_user(conn, send, user, name, opt) {
        // everyone is a user admin if no one is
        if (this.#debug) {
            console.log({ user, name, opt });
        }
        const users = this.#users;
        if (!conn.state.perms.user && (user !== 'list' || name)) {
            return send({ error: 'not permitted' });
        }
        switch (user) {
            case 'add':
                if (!users[name]) {
                    const perms = Object.assign(clone(def_user_perms), opt);
                    const pass = perms.pass;
                    delete perms.pass;
                    const pash = hash(pass || '');
                    users[name] = { pash, perms };
                } else {
                    return send({ user, error: 'user exist' });
                }
                break;
            case 'del':
                if (conn.state.unam === name) {
                    return send({ error: 'user cannot delete self' });
                }
                if (users[name]) {
                    delete users[name];
                } else {
                    return send({ user, error: 'no such user' });
                }
                break;
            case 'pass':
                if (users[name]) {
                    users[name].pash = hash(opt);
                } else {
                    return send({ user, error: 'no such user' });
                }
                break;
            case 'perm':
            case 'perms':
                if (conn.state.unam === name) {
                    return send({ error: 'user cannot change own perms' });
                }
                if (users[name]) {
                    users[name].perms = Object.assign(users[name].perms || {}, opt);
                } else {
                    return send({ user, error: 'no such user' });
                }
                break;
            case 'base':
                if (users[name]) {
                    users[name].base = Object.assign(users[name].base || {}, opt);
                } else {
                    return send({ user, error: 'no such user' });
                }
                break;
            case 'list':
                if (name) {
                    let rec = users[name];
                    if (rec) {
                        return send({ user, rec: { perms: rec.perms, base: rec.base } });
                    } else {
                        return send({ user, error: 'no such user' });
                    }
                } else {
                    return send({ user, list: Object.keys(users) });
                }
            default:
                return send({ user, error: 'invalid user command' });
        }
        send({ user });
        this.#users_save();
    }

    #cmd_drop(conn, send, drop) {
        const { server } = conn;
        let dropdir = `${server.#ddir}/${drop}`;
        if (server.#base[drop]) {
            send({ drop, error: 'database in use' });
        } else if (lastmod(dropdir)) {
            fs.remove(dropdir, (error) => {
                send({ drop, error });
            });
            delete server.#bases[drop];
            server.#bases_save();
        } else {
            send({ drop, error: 'no such database' });
        }
    }

    #cmd_auth(conn, send, auth, pass) {
        const { state, server } = conn;
        const urec = (state.urec = server.#users[auth]);
        const pash = hash(pass || '');
        if (urec && urec.pash === pash) {
            state.perms = urec.perms;
            state.dbperms = {};
            state.unam = auth;
            log({ addr: state.addr, auth, perms: state.perms });
        } else {
            state.perms = no_perms;
            state.unam = undefined;
        }
        this.#uidname[state.uuid] = state.unam;
        send({ auth });
    }

    #cmd_use(conn, send, use, opt = {}) {
        const { state, server } = conn;
        const { addr, perms, urec, unam, uuid } = state;
        if (!(perms.use || (urec && urec.base && urec.base[use] && urec.base[use].use))) {
            return send({ use, error: 'not authorized' });
        }
        if (!validName(use)) {
            return send({ use, error: 'invalid name' });
        }
        if (Array.isArray(use) && use.length === 1 && use[0] === 42) {
            state.close(state.drec);
            state.drec = undefined;
            return send({ use });
        }
        const drec = server.#base[use];
        const dinf = server.#bases[use];
        let path = `${server.#ddir}/${use}`;
        if (drec) {
            state.close(state.drec);
            const db = (state.db = drec.db);
            if (drec.uids.indexOf(uuid) < 0) {
                drec.uids.push(uuid);
            }
            state.drec = drec;
            state.path.length = 0;
            state.path.push(db);
            send({ use, path: state.path.map((p) => p.name) });
            log({ addr, user: unam, open: path });
        } else if (lastmod(path) || perms.create) {
            if (!(lastmod(path) || opt.create)) {
                return send({ use, error: 'no base, missing create parameter' });
            }
            state.close(state.drec);
            let db;
            try {
                opt.valueEncoding = opt.valueEncoding || 'json';
                db = state.db = new Level(path, opt);
            } catch (error) {
                send({ error });
                return;
            }
            db.name = use;
            db.on('error', (error) => {
                console.log({ db_error: error });
                state.close(server.#base[use]);
            });
            state.dinf = server.#bases[use] = dinf || {
                gets: 0,
                puts: 0,
                dels: 0,
                iter: 0,
                created: Date.now(),
                creator: state.unam
            };
            state.drec = server.#base[use] = { uids: [uuid], db };
            state.path.length = 0;
            state.path.push(db);
            send({ use, path: state.path.map((p) => p.name) });
            log({ addr, user: unam, open: path });
        } else {
            return send({ use, error: 'not authorized' });
        }
        state.dnam = use;
        state.dinf = server.#bases[use];
        state.dbperms = urec && urec.base ? urec.base[use] || {} : {};
    }

    #cmd_sub(conn, send, sub, opt = {}) {
        const { state } = conn;
        const { path } = state;
        let { db } = state;
        const subs = Array.isArray(sub) ? sub : [sub];
        for (let sub of subs) {
            if (sub === '/') {
                path.length = 1;
            } else if (sub === '..') {
                if (path.length > 1) {
                    path.length--;
                }
            } else {
                opt.valueEncoding = opt.valueEncoding || 'json';
                const sl = db.sublevel(sub, opt);
                sl.name = sub;
                path.push(sl);
            }
            db = state.db = path[path.length - 1];
        }
        send({ sub, path: path.map((p) => p.name) });
    }

    async #cmd_clear(conn, send, clear) {
        const { state } = conn;
        const { db, perms } = state;
        if (!(perms.del || state.dbperms.del)) {
            return send({ clear, error: 'not authorized' });
        }
        let copt = {};
        try {
            copt = evil(clear);
        } catch (e) {
            send({ error: 'invalid clear options' });
            return;
        }
        await db.clear(copt);
        send({ clear });
    }

    #cmd_get(conn, send, get, opt = {}) {
        const { server, state } = conn;
        const { addr, db, dnam, dinf, perms, unam } = state;
        if (!(perms.get || state.dbperms.get)) {
            return send({ get, error: 'not authorized' });
        }
        db.get(get, opt, (error, value) => {
            if (error && error.notFound) {
                error = undefined;
                value = undefined;
            }
            send({ get, value, error });
            if (server.#dbug[dnam]) {
                log({ addr, name: dnam, user: unam, get, error });
            }
            dinf.gets++;
            server.#stats.gets++;
        });
    }

    #cmd_put(conn, send, put, value, opt = {}) {
        const { server, state } = conn;
        const { addr, db, dnam, dinf, perms, unam } = state;
        if (!(perms.put || state.dbperms.put)) {
            return send({ put, error: 'not authorized' });
        }
        db.put(put, value, opt, (error) => {
            send({ put, error });
            if (server.#dbug[dnam]) {
                log({ addr, name: dnam, user: unam, put, error });
            }
            dinf.puts++;
            server.#stats.puts++;
        });
    }

    #cmd_del(conn, send, del) {
        const { server, state } = conn;
        const { addr, db, dnam, dinf, perms, unam } = state;
        if (!(perms.del || state.dbperms.del)) {
            return send({ del, error: 'not authorized' });
        }
        db.del(del, (error) => {
            send({ del, error });
            if (server.#dbug[dnam]) {
                log({ addr, name: dnam, user: unam, del, error });
            }
            dinf.dels++;
            server.#stats.dels++;
        });
    }

    #cmd_ack(conn, ack, value) {
        const { state } = conn;
        console.log({ ack, value });
        if (state.list[ack] !== undefined) {
            state.list[ack] = value;
        }
    }

    #cmd_list(conn, send, list, opt = {}, call) {
        const { server, state } = conn;
        const { addr, db, dnam, dinf, perms, unam } = state;
        const rangeperm = perms.range || state.dbperms.range || Infinity;
        if (rangeperm === false || rangeperm === 0) {
            return send({ list, error: 'not authorized' });
        }
        let range = rangeperm === true ? Infinity : Math.max(rangeperm, perms.range || 0, state.dbperms.range || 0);
        if (range === 0) {
            return send({ list, error: 'not authorized' });
        }
        let read = 0;
        dinf.iter++;
        server.#stats.iter++;
        let pre = opt.pre;
        if (pre) {
            opt.gte = pre;
        }
        state.list[call] = 0;
        let batch = opt.del ? db.batch() : undefined;
        (async function () {
            try {
                for await (const [key, value] of db.iterator(opt)) {
                    if (pre && !key.startsWith(pre)) {
                        break;
                    }
                    if (opt.skip && read % opt.skip !== 0) {
                        read++;
                        continue;
                    }
                    // { continue } signals client to maintain call:fn mapping
                    // and to expect more replies/data
                    send({ list: { key, value }, continue: true });
                    if (batch) {
                        batch.del(key);
                        dinf.dels++;
                        server.#stats.dels++;
                    }
                    if (read++ >= range) {
                        break;
                    }
                    while (opt.ack && read - state.list[call] > opt.ack * 2) {
                        await pause(10);
                    }
                }
                send({});
            } catch (error) {
                send({ error });
            } finally {
                if (batch) {
                    batch.write();
                }
                if (server.#dbug[dnam]) {
                    log({ addr, name: dnam, user: unam, list: opt, read });
                }
                delete state.list[call];
            }
        })();
    }

    #on_line(conn, state, line) {
        const trace = this.#trace;
        if (trace) {
            console.log(state.db?.status, { server_recv: line });
        }
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
        const { use, sub, clear, get, put, del, list, opt = {}, value, ack } = json;
        const { check_perms, check_db, check_db_open, perms } = state;

        let sent = false;
        function send(objs) {
            if (trace) {
                console.log({ server_send: objs });
            }
            conn.write(encode({ call, ...objs }));
            sent = true;
        }

        if (halt && check_perms(send, perms.halt)) {
            this.#cmd_halt(conn, send, halt);
        } else if (stat) {
            this.#cmd_stat(conn, send, opt);
        } else if (user && check_perms(send, perms.user || this.#admins.length === 0)) {
            this.#cmd_user(conn, send, user, cmd, opt);
        } else if (drop && check_perms(send, perms.drop)) {
            this.#cmd_drop(conn, send, drop);
        } else if (auth) {
            this.#cmd_auth(conn, send, auth, pass);
        } else if (use) {
            this.#cmd_use(conn, send, use, opt);
        } else if (sub && check_db(send)) {
            this.#cmd_sub(conn, send, sub, opt);
        } else if (clear && check_db(send) && check_db_open(send)) {
            this.#cmd_clear(conn, send, clear);
        } else if (get && check_db(send)) {
            this.#cmd_get(conn, send, get, opt);
        } else if (put && check_db(send)) {
            this.#cmd_put(conn, send, put, value, opt);
        } else if (del && check_db(send)) {
            this.#cmd_del(conn, send, del);
        } else if (list && check_db(send)) {
            this.#cmd_list(conn, send, list, opt, call);
        } else if (ack && check_db(send)) {
            this.#cmd_ack(conn, ack, value);
        } else if (debug) {
            this.#dbug[debug] = value;
            send({ debug });
        } else if (!sent) {
            send({ error: `invalid command` });
        }
    }

    #bases_load() {
        if (!lastmod(this.#bdbf)) {
            return;
        }
        const map = evil(fs.readFileSync(this.#bdbf).toString());
        Object.assign(this.#bases, map);
    }

    #bases_save() {
        fs.writeFileSync(this.#bdbf, JSON.stringify(this.#bases, undefined, 4));
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
            if (urec.perms && urec.perms.user) {
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
                '  --host=[host]     defaults to "localhost"',
                '  --port=[port]     listen on port (default 3000)',
                '  --webhost=[host]  defaults to "localhost"',
                '  --webport=[port]  listen on port (default 4040)',
                '  --webdir=[dir]    defaults to "web"',
                "  --dir=[dir]       data directory (default 'data')"
            ].join('\n')
        );
        process.exit();
    }

    new LevelServer({
        host: args.host || process.env.DB_HOST || 'localhost',
        port: args.port || parseInt(process.env.DB_PORT || 3000),
        webhost: args.webhost || process.env.WEB_HOST || 'localhost',
        webport: args.webport || parseInt(process.env.WEB_PORT || 4040),
        webdir: args.webdir || 'web',
        dir: args.dir || args.base || process.env.DB_BASE || 'data',
        user: args.user || process.env.DB_USER || undefined,
        pass: args.pass || process.env.DB_PASS || undefined,
        pash: args.pash || process.env.DB_PASH || undefined
    });
}
