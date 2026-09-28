import { SQL } from "bun";
const db = new SQL("sqlite://pingme.db");

export default db;
