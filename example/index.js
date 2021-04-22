import netLevel, { netLevelRouter } from "./netLevel";
import { fourOhFour, miscErrors } from "./routes";
import compression from "compression";
import minimist from "minimist";
import express from "express";
import dotenv from "dotenv";
import http from "http";

const args = minimist(process.argv.slice(2), {
  default: { port: 8880 },
  alias: { p: "port" },
});

netLevel.setArgs(args);
dotenv.config();

const app = express();
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/db", netLevelRouter);

app.use(fourOhFour);
app.use(miscErrors);

const server = http.Server(app);
startServer(server).catch((err) => console.log(err));

async function startServer(server) {
  server.listen(args.port, () => {
    const host = server.address().address;
    const port = server.address().port;
    console.log({ host, port, date: new Date() });
  });
}
