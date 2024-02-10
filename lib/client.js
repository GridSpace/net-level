#!/usr/bin/env node

const net = require('net');
const { LineBuffer, encode, decode /*, log */ } = require('./util');

function noop() {}

class DB {
    constructor(host, port) {
        if (host) {
            this.open(host, port || 3000);
        }
    }

    isOpen() {
        return this.conn ? true : false;
    }

    init(conn) {
        this.calls = {};
        this.next = 0;
        this.conn = conn;

        new LineBuffer(conn, (line) => {
            let json = decode(line);
            let call = json.call;
            // console.log({ line: line.toString(), json, call, tc: this.calls[call]})
            let { fn, err } = this.calls[call];
            if (json.error) {
                err(json.error);
            } else {
                fn(json);
            }
            if (!json.continue) {
                delete this.calls[call];
            }
        });
    }

    send(obj, fn, err) {
        if (this.conn) {
            let call = this.next++;
            this.calls[call] = { fn, err };
            this.conn.write(encode({ call, ...obj }));
        } else {
            if (this.name && this.host) {
                if (this.defer) {
                    return this.defer.push({ obj, fn, err });
                } else {
                    let defer;
                    let path = this.path;
                    if (path.length > 1) {
                        path = path.slice();
                        path[0] = '/';
                        defer = (this.defer = [
                            { obj: path, fn: noop, err: noop },
                            { obj, fn, err }
                        ]);
                    } else {
                        defer = (this.defer = [{ obj, fn, err }]);
                    }
                    return this.open().catch((error) => {
                        // fail any in-flight queries
                        for (let rec of defer) {
                            try {
                                rec.err({ error });
                            } catch (err) {
                                console.log({ err });
                            }
                        }
                        this.defer = undefined;
                    });
                }
            }
            err(new Error('not connected'));
        }
    }

    halt() {
        return new Promise((resolve, reject) => {
            this.send({ halt: this._pass }, resolve, reject);
        });
    }

    drop(base) {
        return new Promise((resolve, reject) => {
            this.send({ drop: base }, resolve, reject);
        });
    }

    debug(base, value) {
        return new Promise((resolve, reject) => {
            this.send({ debug: base, value }, resolve, reject);
        });
    }

    close() {
        if (this.conn) {
            try {
                this.conn.end();
            } catch (e) {
                console.log({ e });
            }
            this.conn = undefined;
        }
        return this;
    }

    open(host = this.host, port = this.port) {
        return new Promise((resolve, reject) => {
            let conn = net.connect({ host, port });
            conn
                .on('error', (error) => {
                    this.defer = undefined;
                    // console.log({error, calls:this.calls});
                    reject(error);
                })
                .on('close', (/*close*/) => {
                    // console.log({close});
                    this.close();
                })
                .on('connect', (/*connect*/) => {
                    // console.log({connect});
                    this.init(conn);
                    // recover last database and auth on re-open
                    if (this.name && this.host === host) {
                        let promise = this._user
                            ? this.auth(this._user, this._pass).then(() => {
                                return this.use(this.name);
                            })
                            : this.use(this.name);
                        promise
                            .then(() => {
                                let defer = this.defer;
                                this.defer = undefined;
                                if (defer) {
                                    for (let rec of defer) {
                                        this.send(rec.obj, rec.fn, rec.err);
                                    }
                                }
                            })
                            .then(() => {
                                resolve();
                            })
                            .catch((error) => {
                                this.defer = undefined;
                                reject(error);
                            });
                    } else {
                        this.host = host;
                        this.port = port;
                        resolve();
                    }
                });
        });
    }

    stat(opt) {
        return new Promise((resolve, reject) => {
            this.send({ stat: true, opt }, resolve, reject);
        });
    }

    user(user, cmd, opt) {
        return new Promise((resolve, reject) => {
            this.send({ user, cmd, opt }, resolve, reject);
        });
    }

    auth(user, pass) {
        return new Promise((resolve, reject) => {
            this.send(
                { auth: user, pass },
                (reply) => {
                    this._user = user;
                    this._pass = pass;
                    resolve(reply);
                },
                reject
            );
        });
    }

    use(name, opt) {
        return new Promise((resolve, reject) => {
            this.name = name || undefined;
            this.send({ use: name || [42], opt }, (rec) => {
                this.path = rec.path || [ name ];
                resolve();
            }, reject);
        });
    }

    sub(path) {
        return new Promise((resolve, reject) => {
            this.send({ sub: path }, (rec) => {
                this.path = rec.path;
                resolve();
            }, reject);
        });
    }

    clear(opt = {}) {
        return new Promise((resolve, reject) => {
            this.send({ clear: opt }, resolve, reject);
        });
    }

    get(key, opt = {}) {
        return new Promise((resolve, reject) => {
            this.send(
                { get: key },
                opt.raw
                    ? resolve
                    : (reply) => {
                        if (reply.error) {
                            reject(reply.error);
                        } else {
                            resolve(reply.value);
                        }
                    },
                reject
            );
        });
    }

    put(key, value, opt = {}) {
        return new Promise((resolve, reject) => {
            this.send(
                { put: key, value },
                opt.raw
                    ? resolve
                    : (reply) => {
                        if (reply.error) {
                            reject(reply.error);
                        } else {
                            resolve(key, value);
                        }
                    },
                reject
            );
        });
    }

    del(key, opt = {}) {
        return new Promise((resolve, reject) => {
            this.send(
                { del: key },
                opt.raw
                    ? resolve
                    : (reply) => {
                        if (reply.error) {
                            reject(reply.error);
                        } else {
                            resolve(key);
                        }
                    },
                reject
            );
        });
    }

    list(opt, fn, op2 = {}) {
        this.last_list = { opt, fn, op2 };
        return new Promise((resolve, reject) => {
            // let call = this.next++;
            let recs = fn ? undefined : [];
            this.send(
                { list: true, opt },
                (reply) => {
                    let { list, error } = reply;
                    if (list || error) {
                        if (list.key) {
                            this.last_key = list.key;
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
                            recs.push(op2.raw ? reply : reply.list);
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
        if (this.last_list && this.last_key) {
            let { opt, fn, op2 } = this.last_list;
            delete opt.gte;
            delete opt.pre;
            opt.gt = this.last_key
            return this.list(opt, fn, op2);
        } else {
            throw "no previous list";
        }
    }

    keys(opt = {}, fn) {
        opt.values = false;
        return this.list(opt, fn);
    }

    cull(opt = {}, fn) {
        opt.del = true;
        opt.values = false;
        return this.list(opt, fn);
    }
}

module.exports = DB;
