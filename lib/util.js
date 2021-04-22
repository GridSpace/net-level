let fs = require('fs');
let util = require('util');
let { format } = require('date-fns');

function evil(v) {
    try {
        return eval(`(${v})`);
    } catch (e) {
        return v;
    }
}

function clone(o) {
    return JSON.parse(JSON.stringify(o));
}

function encode(obj) {
    return JSON.stringify(obj) + "\n";
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
        format(new Date(), 'yyMMdd.KKmmss'),
        [...arguments]
            .map(v => util.inspect(v, {
                maxArrayLength: null,
                breakLength: Infinity,
                colors: true,
                compact: true,
                sorted: false,
                depth: null
            }))
            .join(' ')
    );
}

class LineBuffer {
    constructor(stream, online) {
        if (!stream) {
            throw "missing stream";
        }
        const lbuf = this;
        this.enabled = true;
        this.buffer = null;
        this.stream = stream;
        this.online = online;
        if (online) {
            stream.on("readable", () => {
                let data;
                while (data = stream.read()) {
                  lbuf.ondata(data);
                }
            });
        } else {
            stream.on("data", data => {
                lbuf.ondata(data);
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
        const cr = data.indexOf("\r");
        const lf = data.indexOf("\n");
        if (lf && cr + 1 == lf) { left = 1 }
        if (lf >= 0) {
            let slice = data.slice(0, lf - left);
            if (this.online) {
                this.online(slice);
            } else {
                this.stream.emit("line", slice);
            }
            this.buffer = data.slice(lf + 1);
            this.nextLine();
        }
    }
}

module.exports = {
    log,
    evil,
    clone,
    encode,
    decode,
    lastmod,
    LineBuffer
};
