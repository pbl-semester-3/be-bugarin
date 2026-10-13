import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../db/schema";
import { env } from "./env";
import { parseMysqlUrl } from "./mysql-connection";

const pool = mysql.createPool({
  ...parseMysqlUrl(env.DATABASE_URL),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
});

export const db = drizzle(pool, { schema, mode: "default" });
