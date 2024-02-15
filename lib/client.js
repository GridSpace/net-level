#!/usr/bin/env node

const { LineBuffer, encode, decode } = require('./util');

class NetDB {
    #retries = 0;
    #retry_timeout = 1000;
    #host = 'localhost';
    #port = 3000;
    #conn = undefined;
    #base = undefined;
    #user = undefined;
    #pass = undefined;
    #path = undefined;
    #defer = undefined;
    #last_key = undefined;
    #last_list = undefined;

    /**
     * signature overload accepts:
     * args: [ host, port ]
     * args: [ { host, port, retries, retry_timeout } ]
     */
    constructor() {
        const args = [...arguments];
        let host, port, retry_timeout, retries, mock;
        if (args.length === 1) {
            switch (typeof args[0]) {
                case 'string':
                    [host, port] = args;
                    break;
                case 'object':
                    ({ host, port, retries, retry_timeout, mock } = args[0]);
                    break;
            }
        } else {
            [host, port] = args;
        }
        this.#retry_timeout = retry_timeout || 1000;
        this.#retries = retries || 0;
        if (host) {
            this.open(host, port || 3000);
        } else if (mock) {
            this.#init(mock);
        }
    }

    #init(conn) {
        this.calls = {};
        this.next = 0;
        this.#conn = conn;

        conn.on('close', () => this.close());

        new LineBuffer(conn, (line) => {
            let json = decode(line);
            let call = json.call;
            // console.log({ line: line.toString(), json, call, tc: this.calls[call] });
            let { fn, err } = this.calls[call] || {
                err(m) { console.error('no call for', call, m) },
                fn(m) { console.log('no call for', call, m) }
            };
            if (json.error) {
                err?.(json.error);
            } else {
                fn?.(json);
            }
            if (!json.continue) {
                delete this.calls[call];
            }
        });
    }

    #netopen(host, port) {
        return new Promise((resolve, reject) => {
            const conn = require('net')
                .connect({ host, port })
                .on('error', reject)
                .on('connect', () => resolve(conn));
        });
    }

    async #send(obj, fn, err) {
        if (this.#conn) {
            let call = this.next++;
            this.calls[call] = { fn, err };
            this.#conn.write(encode({ call, ...obj }));
            return;
        }
        if (!(this.#base && this.#host)) {
            return err('not connected');
        }
        if (this.#defer) {
            return this.#defer.push({ obj, fn, err });
        }
        this.#defer = [{ obj, fn, err }];
        await this.open();
    }

    get path() {
        return this.#path || [];
    }

    isOpen() {
        return this.#conn;
    }

    halt() {
        return new Promise((resolve, reject) => {
            this.#send({ halt: this.#pass }, resolve, reject);
        });
    }

    drop(base) {
        return new Promise((resolve, reject) => {
            this.#send({ drop: base }, resolve, reject);
        });
    }

    debug(base, value) {
        return new Promise((resolve, reject) => {
            this.#send({ debug: base, value }, resolve, reject);
        });
    }

    async close() {
        if (!this.#conn) {
            return this;
        }
        try {
            this.#conn.end();
        } catch (error) {
            console.log({ error });
        }
        this.#conn = undefined;
        return this;
    }

    async open(host = this.#host, port = this.#port) {
        let retries = this.#retries || 0;
        for (;;) {
            let err;
            retries--;
            try {
                this.#init(await this.#netopen(host, port));
                // recover last opened database and sublevel
                if (this.#base && this.#host === host) {
                    if (this.#user) {
                        await this.auth(this.#user, this.#pass);
                    }
                    // copy here b/c use() overwrites it
                    const path = this.#path;
                    if (this.#base) {
                        await this.use(this.#base);
                    }
                    if (path) {
                        await this.sub(path.slice(1));
                    }
                    if (this.#defer) {
                        for (let rec of this.#defer) {
                            this.#send(rec.obj, rec.fn, rec.err);
                        }
                    }
                }
                this.#host = host;
                this.#port = port;
                this.#defer = undefined;
                return;
            } catch (error) {
                // console.log({ CATCH: error, retries });
                err = error;
            }
            if (retries <= 0) {
                if (this.#defer) {
                    // fail any in-flight queries
                    for (let rec of this.#defer) {
                        try {
                            rec.err({ err });
                        } catch (err) {
                            console.log({ err });
                        }
                    }
                }
                this.#defer = undefined;
                throw err;
            }
            await new Promise((resolve) => setTimeout(resolve, this.#retry_timeout));
        }
    }

    stat(opt) {
        return new Promise((resolve, reject) => {
            this.#send({ stat: true, opt }, (reply) => resolve(reply.stat), reject);
        });
    }

    user(user, cmd, opt) {
        return new Promise((resolve, reject) => {
            this.#send({ user, cmd, opt }, (reply) => resolve(reply.rec || reply.list), reject);
        });
    }

    auth(user, pass = '') {
        return new Promise((resolve, reject) => {
            this.#send(
                { auth: user, pass },
                (reply) => {
                    this.#user = user;
                    this.#pass = pass;
                    resolve(reply);
                },
                reject
            );
        });
    }

    use(base, opt) {
        return new Promise((resolve, reject) => {
            this.#base = base || undefined;
            this.#send(
                { use: base || [42], opt },
                (rec) => {
                    this.#path = rec.path || [base];
                    resolve();
                },
                reject
            );
        });
    }

    sub(path) {
        return new Promise((resolve, reject) => {
            this.#send(
                { sub: path },
                (rec) => {
                    this.#path = rec.path;
                    resolve();
                },
                reject
            );
        });
    }

    clear(opt = {}) {
        return new Promise((resolve, reject) => {
            this.#send({ clear: opt }, (reply) => resolve(reply.clear), reject);
        });
    }

    cull(opt = {}, fn = undefined) {
        opt.del = true;
        opt.values = false;
        return fn ? this.list(opt, fn) : new Promise((resolve) => () => this.list(opt, resolve));
    }

    get(key, opt = {}) {
        return new Promise((resolve, reject) => {
            this.#send(
                { get: key },
                opt.raw ? resolve : (reply) => (reply.error ? reject(reply.error) : resolve(reply.value)),
                reject
            );
        });
    }

    put(key, value, opt = {}) {
        return new Promise((resolve, reject) => {
            this.#send(
                { put: key, value },
                opt.raw ? resolve : (reply) => (reply.error ? reject(reply.error) : resolve(key, value)),
                reject
            );
        });
    }

    del(key, opt = {}) {
        return new Promise((resolve, reject) => {
            this.#send(
                { del: key },
                opt.raw ? resolve : (reply) => (reply.error ? reject(reply.error) : resolve(key)),
                reject
            );
        });
    }

    list(opt, fn, op2 = {}) {
        this.#last_list = { opt, fn, op2 };
        return new Promise((resolve, reject) => {
            const recs = fn ? undefined : [];
            this.#send(
                { list: true, opt },
                (reply) => {
                    let { list, error } = reply;
                    if (list || error) {
                        if (list.key) {
                            this.#last_key = list.key;
                        }
                        if (fn) {
                            if (op2.raw) {
                                fn(list);
                            } else if (list.key) {
                                fn(list.key, list.value);
                            } else {
                                fn(list);
                            }
                        } else {
                            recs.push(op2.raw ? reply : list);
                        }
                    }
                    if (!reply.continue) {
                        resolve(recs);
                    }
                },
                reject
            );
        });
    }

    more() {
        if (this.#last_list && this.#last_key) {
            let { opt, fn, op2 } = this.#last_list;
            delete opt.gte;
            delete opt.pre;
            opt.gt = this.#last_key;
            return this.list(opt, fn, op2);
        } else {
            throw new Error('no previous list');
        }
    }

    keys(opt = {}, fn) {
        opt.values = false;
        return fn ? this.list(opt, fn) : new Promise((resolve) => this.list(opt).then(resolve));
    }
}

module.exports = NetDB;
