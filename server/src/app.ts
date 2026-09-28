import express from "express";
import cors from "cors";
import router from "./routes/index";
import db from "./db/connect";
import { initDb } from "./db/init";
import { attachRelay } from "./controllers/relay.controller";

const PORT = 8000;

const app = express();
app.use(cors());
app.use(express.json());

await db`PRAGMA journal_mode = WAL`;
await db`PRAGMA foreign_keys = ON`;
await initDb();

app.use("/api", router);

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

attachRelay(server);
