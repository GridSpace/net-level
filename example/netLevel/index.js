import netLevelClient from "@gridspace/net-level-client";
export { netLevelRouter } from "./router";

let args = {};
const bases = {};

const methods = {
  get: "get",
  set: "set",
  del: "del",
  close: "close",
};

const SUCCESS = { success: true };

const requestHandler = (method) => (base, request) =>
  new Promise((resolve, reject) => {
    try {
      if (method !== "close" && !bases[base]) useBase({ args, base });
      bases[base][method](request).then(resolve, reject);
    } catch (err) {
      reject(err);
    }
  });

const netLevel = {
  setArgs: (values) => (args = values),
  get: (base, request) => requestHandler(methods.get)(base, request),
  set: (base, request) => requestHandler(methods.set)(base, request),
  delete: (base, request) => requestHandler(methods.del)(base, request),
  close: (base) => requestHandler(methods.close)(base),
  bases: () => bases,
};

export function useBase({ args, base }) {
  const db = new netLevelClient();

  let connected;

  async function connect() {
    try {
      await db.open(
        args.dbHost || process.env.DB_HOST,
        args.dbPort || process.env.DB_PORT
      );
      await db.auth(
        args.dbUser || process.env.DB_USER,
        args.dbPass || process.env.DB_PASS
      );
      connected = true;
      await db.use(base);
    } catch (err) {
      throw err;
    }
  }

  async function get(request) {
    try {
      if (!connected) await connect();
      return await db.get(request.key);
    } catch (err) {
      throw err;
    }
  }

  async function set(request) {
    try {
      if (!connected) await connect();
      await db.put(request.key, request.value);
      return SUCCESS;
    } catch (err) {
      throw err;
    }
  }

  async function del(request) {
    try {
      if (!connected) await connect();
      await db.del(request.key, request.value);
      return SUCCESS;
    } catch (err) {
      throw err;
    }
  }

  async function close() {
    try {
      delete bases[base];
      await db.close();
      return SUCCESS;
    } catch (err) {
      throw err;
    }
  }

  bases[base] = {
    [methods.get]: get,
    [methods.set]: set,
    [methods.del]: del,
    [methods.close]: close,
  };
}

netLevel.useBase = useBase;

export default netLevel;
