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
    state.client = client;
    // await client.auth('admin', 'admin').then((auth) => console.log({ auth }));
    // await client.use('foo').then((use) => console.log({ use }));
    // await client.put('abc', Date.now()).then((put) => console.log({ put }));
    // await client.list().then((list) => console.log({ list }));
    const { user, pass } = localStorage;
    auth_do(user || '', pass || '');
}

async function update_users() {
    const users = await state.client.user('list');
    const bind = h.bind($('user-list'), users.map(user => h.label({ _: user, id: `user_${user}` })));
    for (let user of users) {
        bind[`user_${user}`].onclick = () => {
            state.client.user("list", user).then(rec => show_user(user, rec));
        };
    }
}

function show_user(user, rec) {
    console.log({ user, ...rec });
}

async function update_bases(list, open) {
    const bind = h.bind($('base-list'), list.map(base => h.label({
        _: base,
        id: `base_${base}`,
        class: open.indexOf(base) >= 0 ? 'open' : ''
    })));
    for (let base of list) {
        bind[`base_${base}`].onclick = () => {
            state.client.stat({ name: base }).then(bstat => show_base(bstat));
        };
    }
}

function show_base(bstat) {
    console.log({ bstat });
}

async function update_stat() {
    const stat = state.stat = await state.client.stat();
    const { user, path, open, list, gets, puts, dels, iter, mark } = stat;
    if (!mark) $('stats').innerHTML = '';
    if (mark) h.bind($('stats'), [
        h.div([
            h.label("gets"),
            h.input({ value: gets || 0, size: 6, disabled: true })
        ], { class: "labelvalue" }),
        h.div([
            h.label("puts"),
            h.input({ value: puts || 0, size: 6, disabled: true })
        ], { class: "labelvalue" }),
        h.div([
            h.label("dels"),
            h.input({ value: dels || 0, size: 6, disabled: true })
        ], { class: "labelvalue" }),
        h.div([
            h.label("iter"),
            h.input({ value: iter || 0, size: 6, disabled: true })
        ], { class: "labelvalue" }),
        h.div([
            h.label("started"),
            h.input({ value: dayjs(mark || 0).format('YY/MM/DD HH:mm'), size: 18, disabled: true })
        ], { class: "labelvalue" }),
    ]);
    if (list) {
        update_bases(list, open);
        update_users();
    }
    const bind = h.bind($('login'), [
        h.div([
            h.label("IAM"),
            h.input({ value: user || '', size: 15, disabled: true }),
            h.button({ id: 'logout', _: 'logout' })
        ], { class: "labelvalue" }),
    ]);
    bind.logout.onclick = () => auth_do(localStorage.user, '');
    return state.stat;
}

function auth_do(user, pass) {
    localStorage.user = user;
    localStorage.pass = pass;
    return state.client.auth(user, pass).then(auth_check).catch(authenticate);
}

function auth_check() {
    update_stat().then((stat) => {
        if (stat.user) {
            modal_hide();
        } else {
            authenticate();
        }
    });
}

function authenticate() {
    const bind = modal_dialog({
        class: "auth",
        title: "authenticate",
        buttons: [ "proceed" ],
        content: [
            h.label('user'),
            h.input({ id: 'user', value: localStorage.user || '' }),
            h.label('pass'),
            h.input({ id: 'pass', value: localStorage.pass || '', type: 'password' })
        ],
    });
    const { user, pass, b_proceed } = bind;
    onenter(user, () => pass.focus());
    onenter(pass, () => b_proceed.click());
    b_proceed.onclick = () => auth_do(user.value, pass.value);
    localStorage.user ? pass.focus() : user.focus();
}

document.addEventListener('DOMContentLoaded', () => {
    const ws = new WebSocket('ws://' + location.host + '/ws');
    ws.onopen = () => init_client(ws);
    ws.onmessage = (msg) => state.linebuffer.online(msg.data.trim());
});
