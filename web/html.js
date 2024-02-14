(function() {

function build(data, context) {
    if (!data) {
        return [];
    }
    if (Array.isArray(data)) {
        let html = [];
        for (let d of data) {
            html.push(...build(d, context));
        }
        return html;
    }
    let { type, attr, innr, raw } = data;
    if (raw) {
        return [ raw ];
    }
    // auto text content
    if (typeof attr === 'string') {
        attr = { _: attr };
    }
    let elid;
    let html = [];
    let text
    html.push(`<${type}`);
    let func = {};
    for (let [key, val] of Object.entries(attr || {})) {
        let tov = typeof val;
        if (key === '_') {
            text = val;
        } else if (key === 'id') {
            elid = val ? (tov === 'object' ? val.join('_') : val) : undefined;
        } else if (tov === 'function') {
            func[key] = val;
            elid = elid || `_${nextid++}`;
        } else if (tov === 'object') {
            if (val.length)
            html.push(` ${key}="${val.filter(v => v !== undefined).join(' ')}"`);
        } else if (tov !== 'undefined') {
            html.push(` ${key}="${val}"`);
        }
    }
    if (elid) {
        html.push(` id="${elid}"`);
        context.push({elid, func});
    }
    html.push('>');
    if (innr) {
        let snips = [];
        if (innr.length) {
            for (let i of innr) {
                snips.push(build(i, context));
            }
        } else {
            snips.push(build(innr, context));
        }
        html.push(...snips.flat());
    }
    if (text !== undefined) {
        html.push(text);
    }
    html.push(`</${type}>`);
    return html;
}

// core html builder funtions
const h = {
    bind: (el, data, opt = {}) => {
        let ctx = [];
        let html = build(data, ctx).join('');
        if (opt.append) {
            el.innerHTML += html;
        } else {
            el.innerHTML = html;
        }
        let map = {};
        for (let bind of ctx) {
            let { elid, func } = bind;
            let et = $(elid);
            map[elid] = et;
            for (let [name, fn] of Object.entries(func)) {
                et[name] = fn;
            }
        }
        return map;
    },

    el: (type, attr, innr) => {
        if (Array.isArray(attr)) {
            const sub = innr;
            innr = attr;
            attr = sub;
        }
        return { type, attr, innr };
    },

    raw: ( text ) => {
        return { raw: text }
    }
};

// window ui helpers
Object.assign(window, {
    $: (id) => {
        return document.getElementById(id);
    },

    $d: (id, v) => {
        $(id).style.display = v;
    },

    $h: (id, h) => {
        $(id).innerHTML = h;
    },

    h,

    estop: (evt) => {
        evt.stopPropagation();
        evt.preventDefault();
    },

    onenter: (el, fn) => {
        el.addEventListener('keypress', ev => {
            if (ev.code === 'Enter') fn(el);
        });
    }
});

// add common element types
["a", "i", "hr", "div", "span", "label", "input", "button", "svg", "textarea"].forEach(type => {
    h[type] = (attr, innr) => {
        return h.el(type, attr, innr);
    }
});

})();
