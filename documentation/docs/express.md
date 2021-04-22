---
title: Application Server
slug: /express
---

The application in the **_/example_** folder demonstrates calling a net-level database server from an [Express](https://expressjs.com/) application server.

It demonstrates a `netLevelRouter` wrapping a module which provides connection management. While this is not necessarily how you would build an application, it does offer an quick way to begin interacting with **_LevelDB!_**

```js
import netLevel from "./index";
import express from "express";

export const netLevelRouter = express.Router();

netLevelRouter.route("/get").get((req, res) => {
  netLevel.get(req.query.base, req.query).then(
    (value) => res.send(value),
    (err) => res.send({ err })
  );
});

...
```

## Install

```shell
cd example
yarn install
// or
npm install
```

## Connection Parameters

A `.env` file is used to define connection parameterd. Set these values to point to a running net-level server, e.g.:

```shell
DB_HOST=localhost
DB_PORT=3333
DB_USER=admin
DB_PASS=adminpass
```

## Start application server

```shell
node -r esm index.js -p 8880
```

## Run client

In a new terminal window...
...or open the URLs in a browser tab.

```shell
curl -X GET --url "http://localhost:8880/db/set?base=sandbox&key=hello&value=universe"

curl -X GET --url "http://localhost:8880/db/get?base=sandbox&key=hello"

curl -X GET --url "http://localhost:8880/db/set?base=sandbox&key=hello&value=world"

curl -X GET --url "http://localhost:8880/db/get?base=sandbox&key=hello"
```
