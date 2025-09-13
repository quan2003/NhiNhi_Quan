// db.js
import pg from "pg";
const { Pool } = pg;

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.PGSSLMODE === "require"
          ? { rejectUnauthorized: false }
          : false,
    })
  : new Pool({
      host: process.env.PG_HOST || "localhost",
      port: +(process.env.PG_PORT || 5432),
      user: process.env.PG_USER || "postgres",
      password: process.env.PG_PASSWORD || "quan2003",
      database: process.env.PG_DATABASE || "nhi_nhi_quan",
    });

export async function q(sql, params) {
  const { rows } = await pool.query(sql, params);
  return rows;
}
export async function one(sql, params) {
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await fn({
      query: (s, p) => client.query(s, p),
      one: async (s, p) => (await client.query(s, p)).rows[0] || null,
    });
    await client.query("COMMIT");
    return res;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
