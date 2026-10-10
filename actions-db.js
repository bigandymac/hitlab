import Datastore from 'nedb-promises';

export async function initDB(filename) {
  const db = Datastore.create({ filename, autoload: true, timestampData: true });
  await db.ensureIndex({ fieldName: 'id', unique: true });
  return db;
}

export async function saveProject(db, project) {
  await db.insert(project); // Immutable snapshots preserve previous versions.
}

export async function getProject(db, id) {
  const doc = await db.findOne({ id });
  if (!doc) return null;
  const { _id, createdAt, updatedAt, ...project } = doc;
  return project;
}
