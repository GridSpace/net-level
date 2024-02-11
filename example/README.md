# Express Server Example

## Install

```shell
pnpm i
// or
yarn
// or
npm install
```

## Create .env

Set these values to point to a running net-level server, e.g.:

```shell
DB_HOST=localhost
DB_PORT=3333
DB_USER=admin
DB_PASS=adminpass
```

## Start application server

```shell
node -r esm index.js -p 3333
```

## Run client

Open a new terminal window...

```shell
curl -X GET --url "http://localhost:3333/db/get?base=sandbox&key=hello"

curl -X GET --url "http://localhost:3333/db/set?base=sandbox&key=hello&value=universe"

curl -X GET --url "http://localhost:3333/db/get?base=sandbox&key=hello"
```
