const fs = require('fs');
const util = require('util');
const dayjs = require('dayjs');
const crypto = require('crypto');

function evil(v) {
    if (typeof v === 'object') {
        return v;
    }
    try {
        return eval(`(${v})`);
    } catch (e) {
        return v;
    }
}

function hash(str) {
    return crypto.createHash('sha512').update(str.toString()).digest('hex');
}

function clone(o) {
    return JSON.parse(JSON.stringify(o));
}

function encode(obj) {
    return JSON.stringify(obj) + '\n';
}

function decode(str) {
    return JSON.parse(str);
}

function lastmod(path) {
    try {
        return fs.statSync(path).mtime.getTime();
    } catch (e) {
        return 0;
    }
}

function log() {
    console.log(
        dayjs().format('YYMMDD.HHmmss'),
        [...arguments]
            .map((v) =>
                util.inspect(v, {
                    maxArrayLength: null,
                    breakLength: Infinity,
                    colors: true,
                    compact: true,
                    sorted: false,
                    depth: null
                })
            )
            .join(' ')
    );
}

class Piper {
    #name;
    #pipe;
    #queue = [];
    #events = {};

    constructor(name) {
        this.#name = name;
    }

    pipe(pipe) {
        this.#pipe = pipe;
    }

    push(str) {
        this.#queue.push(str);
        this.#events['readable']();
    }

    on(ev, fn) {
        // console.log(this.#name, { on: ev, fn });
        this.#events[ev] = fn;
    }

    end() {}

    read() {
        // console.log(this.#name, { read: this.#queue });
        return this.#queue.length ? this.#queue.shift() : undefined;
    }

    write(str) {
        // console.log(this.#name, { write: str });
        this.#pipe.push(str);
    }
}

class LineBuffer {
    constructor(stream, online) {
        if (!stream) {
            throw 'missing stream';
        }
        this.enabled = true;
        this.buffer = null;
        this.stream = stream;
        this.online = online;
        if (online) {
            stream.on('readable', () => {
                let data;
                while ((data = stream.read())) {
                    this.ondata(data);
                }
            });
        } else {
            stream.on('data', (data) => {
                this.ondata(data);
            });
        }
    }

    ondata(data) {
        if (this.buffer) {
            this.buffer = Buffer.concat([this.buffer, data]);
        } else {
            this.buffer = data;
        }
        this.nextLine();
    }

    nextLine() {
        if (!this.enabled) {
            return;
        }
        let left = 0;
        const data = this.buffer;
        const cr = data.indexOf('\r');
        const lf = data.indexOf('\n');
        if (lf && cr + 1 == lf) {
            left = 1;
        }
        if (lf >= 0) {
            let slice = data.slice(0, lf - left);
            if (this.online) {
                this.online(slice);
            } else {
                this.stream.emit('line', slice);
            }
            this.buffer = data.slice(lf + 1);
            this.nextLine();
        }
    }
}

module.exports = {
    log,
    evil,
    hash,
    clone,
    encode,
    decode,
    lastmod,
    Piper,
    LineBuffer
};
