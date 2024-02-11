import netLevel from './index';
import express from 'express';

export const netLevelRouter = express.Router();

netLevelRouter.route('/ok').get((req, res) => res.send(`I'm OK`));

netLevelRouter.route('/get').get((req, res) => {
    netLevel.get(req.query.base, req.query).then(
        (value) => res.send(value),
        (err) => res.send({ err })
    );
});

netLevelRouter.route('/set').get((req, res) => {
    netLevel.set(req.query.base, req.query).then(
        (value) => res.send(value),
        (err) => res.send({ err })
    );
});

netLevelRouter.route('/delete').get((req, res) => {
    netLevel.delete(req.query.base, req.query).then(
        (value) => res.send(value),
        (err) => res.send({ err })
    );
});

netLevelRouter.route('/close').get((req, res) => {
    netLevel.close(req.query.base, req.query).then(
        (value) => res.send(value),
        (err) => res.send({ err })
    );
});
