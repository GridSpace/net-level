#!/usr/bin/env node

let fs = require('fs');
let net = require('net');
let level = require('level');
let { LineBuffer, encode, decode, lastmod, clone, evil, log } = require('./util');
require('dotenv').config();

let defperms = {
  halt: false,
  stat: false,
  drop: false,
  user: false,
  create: false,
  use: false,
  get: false,
  put: false,
  del: false,
  range: 0
};

function validName(n) {
  return n.indexOf('.') < 0 && n.indexOf('/') < 0;
}

function init(args = { _:[] }) {
  if (args._.indexOf('help') >= 0) {
    console.log(
      [
        'server <args>',
        '  --user=[user]     seed admin user',
        '  --pass=[pass]     seed admin password',
        '  --port=[port]     listen on port (default 3000)',
        "  --dir=[dir]       data directory (default 'data')"
      ].join('\n')
    );
    process.exit();
  }

  let uname = process.env.DB_USER || args.user || 'user';
  let upass = process.env.DB_PASS || args.pass || Date.now().toString(36) + (Math.random() * 0xffffff).toString(36);
  let port = parseInt(process.env.DB_PORT || args.port || 3000);
  let host = args.host || undefined;
  let ddir = process.env.DB_BASE || args.dir || args.base || 'data';
  let udbf = `${ddir}/.users`;
  let nuid = Date.now();
  let users = {};
  let base = {};
  let dbug = {};
  let gets = 0;
  let puts = 0;
  let dels = 0;
  let iter = 0;

  if (!lastmod(ddir)) {
    fs.mkdirSync(ddir);
  }
  if (lastmod(udbf)) {
    let cnf = evil(fs.readFileSync(udbf).toString());
    for (let [uname, urec] of Object.entries(cnf)) {
      users[uname] = urec;
      console.log({ load_user: uname });
    }
  }

  function saveUsers() {
    fs.writeFileSync(udbf, JSON.stringify(users, undefined, 4));
  }

  users[uname] = {
    pass: args.pass || upass,
    perms: {
      halt: true,
      stat: true,
      drop: true,
      user: true,
      create: true,
      use: true,
      get: true,
      put: true,
      del: true,
      range: Infinity
    }
  };

  log(`starting net-level on port ${port} serving "${ddir}"`);

  let server = net
    .createServer((conn) => {
      let addr = conn.remoteAddress;
      let mark = Date.now();
      let uuid = nuid++;
      let unam = 'unknown';
      let name;
      let urec;
      let rec;
      let db;
      let perms = clone(defperms);
      let dbperms = {};

      function close(rec) {
        if (rec) {
          let uids = rec.uids;
          let pos = uids.indexOf(uuid);
          if (pos >= 0) {
            uids.splice(pos, 1);
          }
          if (uids.length === 0) {
            if (db) {
              db.close();
            }
            db = undefined;
            delete base[name];
          }
        }
      }

      function check(call) {
        if (!db) {
          conn.write(encode({ call, error: 'no database in use' }));
          return false;
        }
        return true;
      }

      function deleteDir(dir, then) {
        fs.readdir(dir, (error, files) => {
          deleteFiles(dir, files, then);
        });
      }

      function deleteFiles(dir, files, then) {
        if (files.length) {
          let file = files.shift();
          fs.unlink(`${dir}/${file}`, (error) => {
            if (error) {
              then(error);
            } else {
              deleteFiles(dir, files, then);
            }
          });
        } else {
          fs.rmdir(dir, (error) => {
            then(error);
          });
        }
      }

      new LineBuffer(conn, (line) => {
        let json;
        try {
            json = decode(line);
        } catch (e) {
            console.log({ socket_close_on_invalid_request: line.toString(), from: conn.remoteAddress });
            conn.destroy();
            return;
        }

        let { call, stat, user, cmd, auth, pass, halt, drop, debug } = json;
        let { use, get, put, del, list, opt, value } = json;

        if (halt && perms.halt) {
          server.close();
          for (let rec of Object.values(base)) {
            close(rec);
          }
          conn.write(encode({ call, halt }));
          process.exit();
        } else if (stat && perms.stat) {
          fs.readdir(ddir, (err, list) => {
            stat = {
              open: Object.keys(base),
              list: list.filter(validName),
              mark,
              gets,
              puts,
              dels,
              iter,
              dbug
            };
            if (opt) {
              if (opt.list) {
                stat = stat[opt.list];
              } else if (opt.name) {
                stat = base[opt.name] || undefined;
                if (stat) {
                  let { uids, gets, puts, dels, iter } = stat;
                  let { options } = stat.db;
                  stat = { uids, gets, puts, dels, iter, options };
                }
              }
            }
            conn.write(encode({ call, stat }));
          });
        } else if (user && perms.user) {
          console.log({ user, cmd, opt });
          // conn.write(encode({call, user}));
          switch (user) {
            case 'add':
              if (!users[cmd]) {
                users[cmd] = opt || {
                  pass: '',
                  perms: clone(defperms)
                };
              } else {
                return conn.write(encode({ call, user, error: 'user exist' }));
              }
              break;
            case 'del':
              if (users[cmd]) {
                delete users[cmd];
              } else {
                return conn.write(encode({ call, user, error: 'no such user' }));
              }
              break;
            case 'pass':
              if (users[cmd]) {
                users[cmd].pass = opt;
              } else {
                return conn.write(encode({ call, user, error: 'no such user' }));
              }
              break;
            case 'perm':
            case 'perms':
              if (users[cmd]) {
                users[cmd].perms = Object.assign(users[cmd].perms || {}, opt);
              } else {
                return conn.write(encode({ call, user, error: 'no such user' }));
              }
              break;
            case 'base':
              if (users[cmd]) {
                users[cmd].base = Object.assign(users[cmd].base || {}, opt);
              } else {
                return conn.write(encode({ call, user, error: 'no such user' }));
              }
              break;
            case 'list':
              if (cmd) {
                let rec = users[cmd];
                if (rec) {
                  return conn.write(encode({ call, user, rec }));
                } else {
                  return conn.write(encode({ call, user, error: 'no such user' }));
                }
              } else {
                return conn.write(encode({ call, user, list: Object.keys(users) }));
              }
          }
          conn.write(encode({ call, user }));
          saveUsers();
        } else if (drop && perms.drop) {
          let dropdir = `${ddir}/${drop}`;
          if (base[drop]) {
            conn.write(encode({ call, drop, error: 'database in use' }));
          } else if (lastmod(dropdir)) {
            deleteDir(dropdir, (error) => {
              conn.write(encode({ call, drop, error }));
            });
          } else {
            conn.write(encode({ call, drop, error: 'no such database' }));
          }
        } else if (auth) {
          urec = users[auth];
          if (urec && urec.pass === pass) {
            perms = urec.perms;
            dbperms = {};
            log({ addr, auth, perms });
          } else {
            perms = defperms;
          }
          unam = auth;
          conn.write(encode({ call, auth }));
        } else if (use) {
          if (!(perms.use || (urec && urec.base && urec.base[use] && urec.base[use].use))) {
            return conn.write(encode({ call, use, error: 'not authorized' }));
          }
          if (!validName(use)) {
            return conn.write(encode({ call, use, error: 'invalid name' }));
          }
          close(rec);
          if (Array.isArray(use) && use.length === 1 && use[0] === 42) {
            rec = undefined;
            return conn.write(encode({ call, use }));
          }
          name = use;
          rec = base[use];
          dbperms = urec && urec.base ? urec.base[use] || {} : {};
          let path = `${ddir}/${use}`;
          if (rec) {
            db = rec.db;
            if (rec.uids.indexOf(uuid) < 0) {
              rec.uids.push(uuid);
            }
            conn.write(encode({ call, use }));
            log({ addr, user: unam, open: path });
          } else if (lastmod(path) || perms.create) {
            db = level(path, opt || { valueEncoding: 'json' });
            db.on('error', (error) => {
              console.log({ db_error: error });
              close(base[use]);
            });
            rec = base[use] = {
              uids: [uuid],
              gets: 0,
              puts: 0,
              dels: 0,
              iter: 0,
              db
            };
            conn.write(encode({ call, use }));
            log({ addr, user: unam, open: path });
          } else {
            conn.write(encode({ call, use, error: 'not authorized' }));
          }
        } else if (get) {
          if (!(perms.get || dbperms.get)) {
            return conn.write(encode({ call, get, error: 'not authorized' }));
          }
          if (check(call))
            db.get(get, (error, value) => {
              if (error && error.notFound) {
                error = undefined;
                value = undefined;
              }
              conn.write(encode({ call, get, value, error }));
              if (dbug[name]) {
                log({ addr, name, user: unam, get, error });
              }
              rec.gets++;
              gets++;
            });
        } else if (put) {
          if (!(perms.put || dbperms.put)) {
            return conn.write(encode({ call, put, error: 'not authorized' }));
          }
          if (check(call))
            db.put(put, value, (error) => {
              conn.write(encode({ call, put, error }));
              if (dbug[name]) {
                log({ addr, name, user: unam, put, error });
              }
              rec.puts++;
              puts++;
            });
        } else if (del) {
          if (!(perms.del || dbperms.del)) {
            return conn.write(encode({ call, put, error: 'not authorized' }));
          }
          if (check(call))
            db.del(del, (error) => {
              conn.write(encode({ call, del, error }));
              if (dbug[name]) {
                log({ addr, name, user: unam, del, error });
              }
              rec.dels++;
              dels++;
            });
        } else if (list) {
          if (!(perms.range || dbperms.range)) {
            return conn.write(encode({ call, list, error: 'not authorized' }));
          }
          let range = Math.max(perms.range || 0, dbperms.range || 0);
          let read = 0;
          if (!check(call)) {
            return;
          }
          rec.iter++;
          iter++;
          let pre = opt.pre;
          if (pre) {
            opt.gte = pre;
          }
          let batch = opt.del ? db.batch() : undefined;
          let listdone = () => {
            if (dbug[name]) {
              log({ addr, name, user: unam, list: opt, read });
            }
            if (batch) {
              batch.write();
            }
          };
          let stream = db
            .createReadStream(opt)
            .on('error', (error) => {
              conn.write(encode({ call, error }));
            })
            .on('data', (data) => {
              if (pre) {
                let key = data.key || data;
                if (!key.startsWith(pre)) {
                  conn.write(encode({ call }));
                  listdone();
                  return stream.destroy();
                }
              }
              let cont = read++ < range;
              conn.write(encode({ call, list: data, continue: cont }));
              if (!cont) {
                listdone();
                stream.destroy();
              } else if (batch) {
                batch.del(data.key || data);
                rec.dels++;
                dels++;
              }
            })
            .on('end', () => {
              listdone();
              conn.write(encode({ call }));
            });
        } else if (debug) {
          dbug[debug] = value;
          conn.write(encode({ call, debug }));
        } else {
          conn.write(encode({ call, error: 'no command' }));
        }
      });
      conn.on('close', () => {
        close(rec);
      });
      conn.on('error', (error) => {
        log({ error });
      });
    })
    .listen(port, host);
}

if (module.parent) {
  module.exports = init;
} else {
  init(require('minimist')(process.argv.slice(2)));
}
