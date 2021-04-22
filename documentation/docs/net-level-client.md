---
title: Net Level Client
slug: /net-level-client
---

## Install

```js
yarn add @gridspace/net-level-client
// or
npm install @gridspace/net-level-client
```

## Simple Example

This example assumes you have a Net Level server instance running locally on port `3333`. See [Start Net-Level Server](/docs/setup#start-net-level-server).

```js
let db = new (require("@gridspace/net-level-client"))();
db.open("127.0.0.1", 3333)
  .then(() => db.auth("admin", "adminpass"))
  .then(() => db.use("base"))
  .then(() => db.put("base", { key: "key", value: "value" }))
  .then(() => db.get("base", { key: "key" }))
  .then((value) => console.log({ value }))
  .catch((error) => console.log({ error }));
```

## API

The Net Level client library supports the same commands as the [CLI client](/docs/cli#check-help)
