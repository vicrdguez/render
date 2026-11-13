import { DatabaseSync } from "node:sqlite";
let db;
try {
  db = new DatabaseSync(process.argv[2]);
  db.exec("PRAGMA busy_timeout=0; PRAGMA journal_mode=DELETE; BEGIN EXCLUSIVE");
  process.on("message", () => {}); // keep IPC referenced while the server owns this connection
  process.send({ locked: true });
} catch (error) {
  db?.close();
  process.send({ locked: false, code: error.code, message: error.message });
  process.disconnect();
}
