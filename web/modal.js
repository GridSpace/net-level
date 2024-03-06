function modal_show(content) {
    const bind = h.bind($('modal'), content);
    $d('modal', 'flex');
    return bind;
}

function modal_hide() {
    $d('modal', 'none');
}

function modal_dialog(opts = { content: [], buttons: [], title: '', class: '' }) {
    const { content, buttons, title } = opts;
    return modal_show(h.div([
        h.div([
            h.label({ _: title})
        ], { class: "title" }),
        h.div(content, { class: "content" }),
        h.div(buttons.map(b => h.button({ id: `b_${b}`, _: b })), { class: "buttons" })
    ], { class: opts.class }));
}
