---
title: Net-Level Server Setup
slug: /setup
---

## Install

```shell
yarn install
// or
npm install
```

## Start Net-Level Server

The default port for net-level is 3000. This may conflict with other processes, so best to set a port you know is not in use.

```shell
node lib/server --user=admin --pass=adminpass --port 3333
```

Or you can use environment variables to seed the user and password

```shell
DB_USER=admin DB_PASS=adminpass node lib/server --port 3333
```

Starting the server will create `data/.users` if it does not already exist and add (or update) the referenced user and password. Starting the server does not require a username and password provided if the `data/.users` file already exists.

To run servers in production, consider using [PM2](https://www.npmjs.com/package/pm2)
