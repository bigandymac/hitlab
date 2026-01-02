import pkg from "pg"; const { Pool } = pkg;
export async function initPG(url) {
  const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30000 });
  await pool.query(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
  return pool;
}
export async function upsertProjectPG(pool, id, title, data) {
  await pool.query(`INSERT INTO projects (id,title,data)
    VALUES ($1,$2,$3)
    ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, data=EXCLUDED.data, updated_at=NOW()`, [id,title,data]);
}
export async function getProjectPG(pool, id) {
  const { rows } = await pool.query("SELECT * FROM projects WHERE id=$1", [id]);
  if (!rows.length) return null;
  return { id: rows[0].id, title: rows[0].title, data: rows[0].data, updatedAt: rows[0].updated_at };
}
