const state = {
    event: []
};

// monkey patch to load nodejs code
const module = {};

// monkey patch nodejs client lib
function require(path) {
    class LineBuffer {
        constructor(conn, online) {
            this.conn = conn;
            this.online = online;
            state.linebuffer = this;
        }
    }

    if (path !== './util') {
        return {};
    }

    return {
        encode(obj) {
            return JSON.stringify(obj) + '\n';
        },
        decode(str) {
            return JSON.parse(str);
        },
        LineBuffer
    };
}

async function init_client(ws) {
    const { event } = state;
    const client = new NetDB({
        mock: {
            on(ev, fn) {
                event[ev] = fn;
            },
            write(data) {
                ws.send(data);
            }
        }
    });
    await client.auth('admin', 'admin').then((auth) => console.log({ auth }));
    await client.stat().then((stat) => console.log({ stat }));
    await client.use('foo').then((use) => console.log({ use }));
    await client.put('abc', Date.now()).then((put) => console.log({ put }));
    await client.list().then((list) => console.log({ list }));
    return (state.client = client);
}

document.addEventListener('DOMContentLoaded', () => {
    const ws = new WebSocket('ws://' + location.host + '/ws');
    ws.onopen = async () => {
        state.client = await init_client(ws);
    };
    ws.onmessage = (msg) => {
        state.linebuffer.online(msg.data.trim());
    };
});
