#!/usr/bin/env node

let LineBuffer = require('./util').LineBuffer;
let { evil } = require('./util');
let client = new (require('../index'))();
let args = require('minimist')(process.argv.slice(2));
let host = args.host || 'localhost';
let port = parseInt(args.port || 3000);
let user = args.user || undefined;
let pass = args.pass || undefined;
let base = args.base || undefined;
let verbose = !args.quiet;

let exiting = false;
let limit = undefined;
let current = '';
let promise;

if (verbose) {
  console.log('[ grid.space net level client 1.0 ]');
}

function onerror(error) {
  console.log({ db_error: error });
}

if (host) {
  promise = client.open(host, port).catch(onerror);
  if (user) {
    promise = promise
      .then(() => {
        return client.auth(user, pass);
      })
      .catch(onerror);
  }
  if (base) {
    promise = promise
      .then(() => {
        return client.use(base);
      })
      .catch(onerror);
  }
}

function prompt(reply) {
  if (reply && reply.error) {
    console.log(reply.error);
  }
  if (exiting) {
    process.exit();
  }
  if (verbose) {
    process.stdout.write(`:${current}: `);
  }
}

function error(scope) {
  return function (error) {
    console.log({ [`${scope}_error`]: error });
    prompt();
  };
}

if (promise) {
  promise.then(prompt).then(start);
} else {
  prompt();
  start();
}

function start() {
  new LineBuffer(process.stdin, next);
  process.stdin.on('close', () => {
    exiting = true;
  });
}

function help_user() {
  console.log(
    [
      'list                   - list all users',
      "list  [user]           - show user's details",
      'add   [user] <opts>    - add user with optional settings',
      'del   [user]           - delete user',
      "pass  [user] [pass]    - set user's password",
      "perm  [user] <perms>   - set user's general permissions",
      "base  [user] <perms>   - set user's datastore permissions"
    ].join('\n')
  );
}

function help(args) {
  if (args.length) {
    switch (args[0]) {
      case 'user':
        return help_user(args.slice(1));
    }
  }
  console.log(
    [
      'auth  [user] [pass]    - authenticate connection with server',
      'drop  [base]           - drop a database (cannot be in use)',
      'debug [base] [0|1]     - disable or enable debugging for a data store',
      'close                  - disconnect client from server',
      'open  [host] <port>    - connect client to a server',
      'stat  [cmd]  <opts>    - get server or data store stats (with auth)',
      'user  [cmd]  <opts>    - get or set user info (with auth)',
      'use   [base] <opts>    - make data store active (create with auth)',
      "get   [key]            - fetch key's value from active data store",
      'put   [key]  [value]   - put key/value pair into active data store',
      "del   [key]            - delete key's value from active data store",
      'list  [from] <to>      - list entries in range provided',
      'cull  [from] <to>      - delete entries in range provided',
      'keys  [from] <to>      - list only keys in range provided',
      'count [from] <to>      - count entries in range provided',
      'limit [count]          - limit range queries to [count] max entries',
      'help  [command]        - command help'
    ].join('\n')
  );
}

function next(line) {
  let ls = {};
  line = line
    .toString()
    .trim()
    .split(' ')
    .map((v) => v.trim());
  let cmd = line.shift();
  switch (cmd) {
    case '?':
    case 'help': {
      help(line);
      prompt();
      break;
    }
    case 'halt':
      client.halt().then(prompt).catch(error('halt'));
      break;
    case 'drop': {
      client.drop(line[0]).catch(error('drop'));
      prompt();
      break;
    }
    case 'debug': {
      let value;
      try {
        value = eval(`(${line[1]})`);
      } catch (err) {
        console.log(err.message);
        prompt();
        break;
      }
      client.debug(line[0], value).then(prompt).catch(error('debug'));
      break;
    }
    case 'close': {
      client.close();
      current = '';
      prompt();
      break;
    }
    case 'open': {
      client
        .close()
        .open(line[0] || client.host || host, parseInt(line[1] || client.port || port))
        .then(prompt)
        .catch(error('open'));
      break;
    }
    case 'user': {
      client
        .user(line[0], line[1], evil(line[2]))
        .then((reply) => {
          if (reply.list || reply.rec) {
            console.log(reply.list || reply.rec);
          }
        })
        .then(prompt)
        .catch(error('user'));
      break;
    }
    case 'stat': {
      let opts = {};
      if (line[0]) {
        if (line[0].charAt(0) === '*') {
          opts.list = line[0].substring(1);
        } else {
          opts.name = line[0];
        }
      }
      client
        .stat(opts)
        .then((reply) => {
          let stat = reply.stat;
          if (Array.isArray(stat)) {
            stat = stat.join('\n');
          }
          if (stat) {
            console.log(stat);
          }
          prompt();
        })
        .catch(error('stat'));
      break;
    }
    case 'auth':
      client.auth(line[0], line[1]).then(prompt).catch(error('auth'));
      break;
    case 'use': {
      let dbn = line[0] || [42];
      let enc = line[1] ? { valueEncoding: line[1] === 'none' ? undefined : line[1] } : undefined;
      client
        .use(dbn, enc)
        .then(() => {
          current = Array.isArray(dbn) ? '' : dbn;
        })
        .then(prompt)
        .catch(error('use'));
      break;
    }
    case 'get':
      client
        .get(line[0])
        .then((reply) => {
          console.log(reply);
          prompt();
        })
        .catch(error('get'));
      break;
    case 'put': {
      let [key, val] = line;
      try {
        val = eval(`(${val})`);
      } catch (err) {
        console.log(err.message);
        prompt();
        break;
      }
      client
        .put(key, val)
        .then(() => {
          prompt();
        })
        .catch(error('put'));
      break;
    }
    case 'del':
      client.del(line[0]).then(prompt).catch(error('del'));
      break;
    case 'limit':
      limit = line[0] ? parseInt(line[0]) : undefined;
      prompt();
      break;
    /*
    case 'ls':
      ls = {};
      */
    case 'count':
    case 'list':
    case 'keys':
    case 'cull': {
      let isCull = cmd === 'cull';
      let isLS = cmd === 'ls';
      let isCount = cmd === 'count';
      let isKeys = cmd === 'keys' || isCount || isLS || isCull;
      let opt =
        line.length === 1 || isLS
          ? {
              pre: line[0]
            }
          : {
              gte: line[0],
              lt: line[1]
            };
      opt.del = isCull ? true : undefined;
      let count = 0;
      client
        .list(
          Object.assign(
            {
              values: isKeys ? false : true,
              limit
            },
            opt
          ),
          (key, value) => {
            count++;
            if (!isCount) {
              if (isLS) {
                let kv = (line[0] ? key.substring(line[0].length) : key).split('/')[0];
                if (kv.length === 0) {
                  return;
                }
                if (!ls[kv]) {
                  console.log(kv);
                  ls[kv] = 1;
                } else {
                  ls[kv]++;
                }
              } else {
                console.log(isKeys ? key : { key, value });
              }
            }
          }
        )
        .then(() => {
          if (isLS) {
            for (let key in ls) {
              if (ls[key] === 1) {
                delete ls[key];
              }
            }
            if (Object.keys(ls).length) {
              console.log(ls);
            }
          }
          console.log({ count });
          prompt();
        })
        .catch(error('list'));
      break;
    }
    case 'exit':
    case 'quit':
      exiting = true;
    case '': {
      prompt();
      break;
    }
    default: {
      console.log({ invalid_command: cmd });
      prompt();
      break;
    }
  }
}
