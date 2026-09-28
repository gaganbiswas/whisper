import { SQL } from "bun";
const db = new SQL("sqlite://whisper.db");

export default db;
