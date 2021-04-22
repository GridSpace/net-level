---
title: Command Line Client
slug: /cli
---

## Start a client

The default port for net-level is 3000. If you have started your server on another port, be sure to tell the client!

```shell
node lib/cli --user=admin --pass=adminpass --port 3333
```

## CLI Uses

The net-level client provides an interface for simple admin tasks.

:::info
The term `base` is used to refer to a data store
:::

## Check Help

`help` will list available commands regardless of current connection and auth status, but command availability is limited by auth level with the connected server.

```shell
[ grid.space net level client 1.0 ]
:: help
auth  [user] [pass]    - authenticate connection with server
drop  [base]           - drop a database (cannot be in use)
debug [base] [0|1]     - disable or enable debugging for a data store
close                  - disconnect client from server
open  [host] <port>    - connect client to a server
stat  [cmd]  <opts>    - get server or data store stats (with auth)
user  [cmd]  <opts>    - get or set user info (with auth)
use   [base] <opts>    - make data store active (create with auth)
get   [key]            - fetch key's value from active data store
put   [key]  [value]   - put key/value pair into active data store
del   [key]            - delete key's value from active data store
list  [from] <to>      - list entries in range provided
cull  [from] <to>      - delete entries in range provided
keys  [from] <to>      - list only keys in range provided
count [from] <to>      - count entries in range provided
limit [count]          - limit range queries to [count] max entries
help  [command]        - command help
```

## Create a Data Store

A store will be created if it does not already exist.

```shell
use sandbox
```

## Add a key:value pairs

The CLI only supports values with no spaces. More complex values must be added programmatically via the client library.

```shell
:sandbox: put x {key:"value"}
:sandbox: put y {foo:"bar"}
```

## Range Queries

The `keys`, `list`, `count`, and `cull` commands operate on Lexicographic order and return everthing greater than or equal to **_from_** and less than **_to_**, unless a `limit` has been specified.

```js
// keys [from] <to>
:sandbox: keys x y
x
{ count: 1 }
:sandbox: keys x z
x
y
{ count: 2 }
```

```shell
:sandbox: list x z
{ key: 'x', value: { key: 'value' } }
{ key: 'y', value: { foo: 'bar' } }
{ count: 2 }
```
