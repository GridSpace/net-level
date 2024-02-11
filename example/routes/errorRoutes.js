export function fourOhFour(req, res) {
    res.status(404).send("Sorry can't find that");
}

export function miscErrors(err, req, res) {
    res.locals.error = err;
    const status = err.status || 500;
    res.status(status);
    res.render('error');
}
