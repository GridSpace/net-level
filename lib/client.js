#!/usr/bin/env node

let net = require('net');
let { LineBuffer, encode, decode, log } = require('./util');

class DB {
    constructor(host,port) {
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

        new LineBuffer(conn, line => {
            let json = decode(line);
            let call = json.call;
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
            this.calls[call] = {fn, err};
            this.conn.write(encode({call, ...obj}));
        } else {
            if (this.name && this.host) {
                if (this.defer) {
                    return this.defer.push({obj, fn, err});
                } else {
                    let client = this;
                    let defer = this.defer = [{obj, fn, err}];
                    return this.open().catch(error => {
                        // fail any in-flight queries
                        for (let rec of defer) {
                            try { rec.err({error}) } catch (e) { }
                        }
                        client.defer = undefined;
                    });
                }
            }
            err(new Error("not connected"));
        }
    }

    halt() {
        return new Promise((resolve, reject) => {
            this.send({halt: this._pass}, resolve, reject)
        });
    }

    drop(base) {
        return new Promise((resolve, reject) => {
            this.send({drop: base}, resolve, reject)
        });
    }

    debug(base, value) {
        return new Promise((resolve, reject) => {
            this.send({debug: base, value}, resolve, reject)
        });
    }

    close() {
        if (this.conn) {
            try { this.conn.end(); } catch (e) { console.log({e}) }
            this.conn = undefined;
        }
        return this;
    }

    open(host = this.host, port = this.port) {
        return new Promise((resolve, reject) => {
            let conn = net.connect({host, port});
            conn
                .on('error', error => {
                    this.defer = undefined;
                    // console.log({error, calls:this.calls});
                    reject(error);
                })
                .on('close', close => {
                    // console.log({close});
                    this.close();
                })
                .on('connect', connect => {
                    // console.log({connect});
                    this.init(conn);
                    // recover last database and auth on re-open
                    if (this.name && this.host === host) {
                        let promise = this._user ?
                            this.auth(this._user, this._pass).then(() => {
                                return this.use(this.name);
                            }) :
                            this.use(this.name);
                        promise.then(() => {
                            let defer = this.defer;
                            this.defer = undefined;
                            if (defer) {
                                for (let rec of defer) {
                                    this.send(rec.obj, rec.fn, rec.err);
                                }
                            }
                        }).then(() => {
                            resolve();
                        }).catch(error => {
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
            this.send({stat: true, opt}, resolve, reject)
        });
    }

    user(user, cmd, opt) {
        return new Promise((resolve, reject) => {
            this.send({user, cmd, opt}, resolve, reject)
        });
    }

    auth(user, pass) {
        return new Promise((resolve, reject) => {
            this.send({auth: user, pass}, reply => {
                this._user = user;
                this._pass = pass;
                resolve(reply);
            }, reject)
        });
    }

    use(name, opt) {
        return new Promise((resolve, reject) => {
            this.name = name;
            this.send({use: name, opt}, resolve, reject);
        });
    }

    get(key, opt = {}) {
        return new Promise((resolve, reject) => {
            this.send({get: key}, opt.raw ? resolve : reply => {
                if (reply.error) {
                    reject(reply.error);
                } else {
                    resolve(reply.value);
                }
            }, reject);
        });
    }

    put(key, value, opt = {}) {
        return new Promise((resolve, reject) => {
            this.send({put: key, value}, opt.raw ? resolve : reply => {
                if (reply.error) {
                    reject(reply.error);
                } else {
                    resolve(key, value);
                }
            }, reject);
        });
    }

    del(key, opt = {}) {
        return new Promise((resolve, reject) => {
            this.send({del: key}, opt.raw ? resolve : reply => {
                if (reply.error) {
                    reject(reply.error);
                } else {
                    resolve(key);
                }
            }, reject);
        });
    }

    list(opt, fn, op2 = {}) {
        return new Promise((resolve, reject) => {
            let call = this.next++;
            let recs = fn ? undefined : [];
            this.send({list: true, opt}, reply => {
                let { list, error } = reply;
                if (list || error) {
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
            }, reject);
        });
    }
}

module.exports = DB;
