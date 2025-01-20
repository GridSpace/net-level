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
    const { user, pass } = localStorage;
    auth_do(user || '', pass || '');
}

async function update_users() {
    const users = await state.client.user('list');
    const ulist = users.map((user) =>
        h.label({
            _: user,
            onclick(ev) {
                [...ev.target.parentNode.children].forEach((l) => l.classList.remove('selected'));
                ev.target.classList.add('selected');
                state.client.user('list', user).then((rec) => show_user(user, rec));
            }
        })
    );
    ulist.push(
        h.label({
            _: '+',
            class: 'adder',
            async onclick(ev) {
                const name = await get_new_name('add user');
                name && state.client.user('add', name).then(update_users);
            }
        })
    );
    const bind = h.bind('user-list', ulist);
}

function gen_userbase_perms(perms) {
    return Object.keys(perms)
        .sort()
        .map((perm) =>
            h.div([
                h.input({
                    type: 'checkbox',
                    [perms[perm] ? 'checked' : '']: true,
                    onchange() {
                        perms[perm] = !perms[perm];
                        $('save-changes').disabled = false;
                    }
                }),
                h.label(perm)
            ])
    );
}

function show_user(user, rec) {
    let { perms, base } = rec;
    h.bind('user-edit', [
        h.div([], { id: 'user-perm' }),
        h.div([
            h.button({
                disabled: true,
                id: 'save-changes',
                _: 'save changes',
                async onclick() {
                    if (base) await state.client.user('base', user, base);
                    await state.client.user('perms', user, perms);
                    $('save-changes').disabled = true;
                }
            }),
            h.button({
                _: 'set password',
                async onclick() {
                    const pass = await get_password();
                    pass && (await state.client.user('pass', user, pass));
                }
            }),
            h.button({
                _: 'delete user',
                async onclick() {
                    if (confirm('delete user?')) {
                        await state.client.user('del', user);
                        update_users();
                    }
                }
            })
        ])
    ]);
    const blist = ["*", ...state.bases].map((bname) =>
        h.label({
            _: bname,
            id: `ubase_${bname}`,
            onclick(ev) {
                let cperms = perms;
                if (bname !== '*') {
                    if (!rec.base) {
                        base = rec.base = {};
                    }
                    let bperms = base[bname];
                    if (!bperms) {
                        bperms = base[bname] = Object.assign({}, perms);
                        ["create", "drop", "halt", "user"].forEach(k => delete bperms[k]);
                    }
                    cperms = bperms;
                }
                h.bind('user-perm', gen_userbase_perms(cperms));
                [...ev.target.parentNode.children].forEach((l) => l.classList.remove('selected'));
                ev.target.classList.add('selected');
            }
        })
    );
    const bound = h.bind('user-base', blist);
    bound[`ubase_*`].onclick({ target: bound[`ubase_*`] });
}

async function update_bases(list, open) {
    state.bases = list;
    const blist = list.map((base) =>
        h.label({
            _: base,
            class: open.indexOf(base) >= 0 ? 'open' : '',
            onclick(ev) {
                [...ev.target.parentNode.children].forEach((l) => l.classList.remove('selected'));
                ev.target.classList.add('selected');
                state.client.stat({ name: base }).then((bstat) => show_base(base, bstat));
            }
        })
    );
    blist.push(h.label({
        _: '+',
        class: 'adder',
        async onclick(ev) {
            const name = await get_new_name('add base');
            name && state.client.use(name, { create: true }).then(() => {
                state.client.use()
            }).then(update_stat);
        }
    }));
    const bind = h.bind('base-list', blist);
}

function show_base(base, bstat) {
    const query = h.button({
        _: 'query range',
        async onclick() {
            const { client } = state;
            await client.use(base);
            const first = await client.list({ values: false, limit: 1 });
            const last = await client.list({ reverse: true, values: false, limit: 1 });
            if (first.length && last.length) {
                alert(`first key: ${first[0].key}\nlast key: ${last[0].key}`);
            } else {
                alert('empty base');
            }
        }
    });
    h.bind('base-edit', h.div([
        h.label('created'),
        h.label(dayjs(bstat.created).format('YY/MM/DD HH:mm')),
        h.label('creator'),
        h.label(bstat.creator),
        ...['gets','dels','puts','iter'].map(k => [ h.label(k), h.label(bstat[k]) ]).flat(),
        h.label('active'),
        h.label(bstat.active || 0),
        h.label('users'),
        h.label((bstat.users || []).join(',')),
        ...(bstat.active ? [ query ] : [
            query,
            h.button({
                _: 'delete base',
                onclick() {
                    if (confirm(`delete base "${base}`)) {
                        state.client.drop(base).then(update_stat);
                    }
                }
            })
        ])
    ]));
}

async function update_stat() {
    const stat = (state.stat = await state.client.stat());
    const { user, path, open, list, gets, puts, dels, iter, mark } = stat;
    if (!mark) $('stats').innerHTML = '';
    if (mark)
        h.bind('stats', [
            h.div([h.label('gets'), h.input({ value: gets || 0, size: 6, disabled: true })], { class: 'labelvalue' }),
            h.div([h.label('puts'), h.input({ value: puts || 0, size: 6, disabled: true })], { class: 'labelvalue' }),
            h.div([h.label('dels'), h.input({ value: dels || 0, size: 6, disabled: true })], { class: 'labelvalue' }),
            h.div([h.label('iter'), h.input({ value: iter || 0, size: 6, disabled: true })], { class: 'labelvalue' }),
            h.div(
                [
                    h.label('started'),
                    h.input({ value: dayjs(mark || 0).format('YY/MM/DD HH:mm'), size: 18, disabled: true })
                ],
                { class: 'labelvalue' }
            )
        ]);
    if (list) {
        update_bases(list, open);
        update_users();
    }
    const bind = h.bind('login', [
        h.div(
            [
                h.label('IAM'),
                h.input({ value: user || '', size: 15, disabled: true }),
                h.button({ id: 'logout', _: 'logout' })
            ],
            { class: 'labelvalue' }
        )
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

function get_new_name(title) {
    const bind = modal_dialog({
        title,
        class: 'simple-modal',
        buttons: ['add', 'cancel'],
        content: [h.label('name'), h.input({ id: 'user', value: '' })]
    });
    return new Promise((resolve) => {
        function done(val) {
            resolve(val || undefined);
            modal_hide();
        }
        const { user, b_add, b_cancel } = bind;
        onenter(user, () => done(user.value));
        b_add.onclick = () => done(user.value);
        b_cancel.onclick = () => done();
        user.focus();
    });
}

function get_password() {
    const bind = modal_dialog({
        class: 'simple-modal',
        title: 'password',
        buttons: ['set', 'cancel'],
        content: [h.label('pass'), h.input({ id: 'pass', value: '', type: 'password' })]
    });
    return new Promise((resolve) => {
        function done(val) {
            resolve(val || undefined);
            modal_hide();
        }
        const { pass, b_set, b_cancel } = bind;
        onenter(pass, () => done(pass.value));
        b_set.onclick = () => done(pass.value);
        b_cancel.onclick = () => done();
        pass.focus();
    });
}

function authenticate() {
    const bind = modal_dialog({
        class: 'simple-modal',
        title: 'authenticate',
        buttons: ['proceed'],
        content: [
            h.label('user'),
            h.input({ id: 'user', value: localStorage.user || '' }),
            h.label('pass'),
            h.input({ id: 'pass', value: localStorage.pass || '', type: 'password' })
        ]
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
