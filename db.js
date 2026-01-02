// db.js — NeDB (nedb-promises) zero-compile datastore
import Datastore from 'nedb-promises';
import path from 'path';

let db;

export function initDB(dbPath) {
  const resolved = dbPath || path.resolve('./hitlab.db.json');
  db = Datastore.create({
    filename: resolved,
    autoload: true,
    timestampData: true,
    corruptAlertThreshold: 1
  });
  // Ensure unique index on id
  db.ensureIndex({ fieldName: 'id', unique: true }).catch(() => {});
  return db;
}

export async function upsertProject(_db, id, title, data) {
  const doc = {
    id,
    title: title || 'Untitled',
    data,
    updated_at: new Date().toISOString()
  };
  await db.update({ id }, { $set: doc }, { upsert: true });
}

export async function getProject(_db, id) {
  const doc = await db.findOne({ id });
  if (!doc) return null;
  return {
    id: doc.id,
    title: doc.title,
    data: doc.data,
    updatedAt: doc.updated_at
  };
}
