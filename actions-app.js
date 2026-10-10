import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { initDB, saveProject, getProject } from './actions-db.js';
import { makeReportPDF } from './actions-pdf.js';
import { projectFields } from './openapi.js';

const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, max, required = false) => typeof v === 'string' && v.length <= max && (!required || v.trim().length > 0);
const error = (res, status, message) => res.status(status).json({ ok: false, error: message });
const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

export async function createApp({ apiKey, baseUrl, dbFile, outDir, now = Date.now }) {
  if (typeof apiKey !== 'string' || apiKey.length < 32) throw new Error('HITLAB_ACTIONS_KEY must contain at least 32 characters');
  const origin = new URL(baseUrl);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('BASE_URL must be an HTTP(S) origin');
  await mkdir(path.dirname(dbFile), { recursive: true });
  await mkdir(outDir, { recursive: true });
  const db = await initDB(dbFile);
  const downloads = new Map();
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ referrerPolicy: { policy: 'no-referrer' } }));
  app.use(rateLimit({ windowMs: 60000, limit: 120 }));
  app.get('/health', (_, res) => res.json({ ok: true, service: 'hitlab-actions', version: '1.1.0' }));
  // No request URL logging: temporary download tokens appear in the URL.
  app.get('/downloads/:fileId', route(async (req, res) => {
    const record = downloads.get(req.params.fileId);
    if (!record || typeof req.query.token !== 'string' || req.query.token !== record.token) return error(res, 404, 'Download not found');
    if (now() >= record.expiresAt) {
      downloads.delete(req.params.fileId);
      await unlink(record.filePath).catch(() => {});
      return error(res, 410, 'Download expired; export again');
    }
    res.set('Cache-Control', 'no-store');
    res.download(record.filePath, 'HitLab-report.pdf');
  }));
  const expected = Buffer.from(apiKey);
  app.use((req, res, next) => {
    const header = req.get('authorization') || '';
    const supplied = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return error(res, 401, 'Authentication required');
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.post('/projects', route(async (req, res) => {
    const body = req.body;
    if (!object(body) || !text(body.title, 160, true) || !object(body.data) || !text(body.data.instructionVersion, 80, true)) return error(res, 400, 'title, data and instructionVersion are required');
    if (Object.keys(body).some(k => !['title', 'data'].includes(k))) return error(res, 400, 'Unknown project field');
    for (const [key, value] of Object.entries(body.data)) {
      if (!Object.hasOwn(projectFields, key) || !text(value, projectFields[key].maxLength)) return error(res, 400, 'Invalid project data');
    }
    if (JSON.stringify(body.data).length > 32000) return error(res, 400, 'Project data exceeds 32000 characters');
    const project = { id: `proj_${randomUUID()}`, title: body.title, data: body.data, savedAt: new Date(now()).toISOString() };
    await saveProject(db, project);
    res.status(201).json({ ok: true, projectId: project.id, savedAt: project.savedAt });
  }));
  app.get('/projects/:projectId', route(async (req, res) => {
    if (!/^proj_[0-9a-f-]{36}$/.test(req.params.projectId)) return error(res, 404, 'Project not found');
    const project = await getProject(db, req.params.projectId);
    if (!project) return error(res, 404, 'Project not found');
    res.json({ ok: true, project });
  }));
  app.post('/reports/export', route(async (req, res) => {
    const body = req.body;
    if (!object(body) || Object.keys(body).some(k => !['title', 'sections'].includes(k)) || !text(body.title, 160, true) || !Array.isArray(body.sections) || body.sections.length < 1 || body.sections.length > 12) return error(res, 400, 'title and 1-12 sections are required');
    for (const section of body.sections) {
      if (!object(section) || Object.keys(section).some(k => !['heading', 'body'].includes(k)) || !text(section.heading, 160, true) || !text(section.body, 8000, true)) return error(res, 400, 'Invalid report section');
    }
    if (JSON.stringify(body).length > 32000) return error(res, 400, 'Report exceeds 32000 characters');
    for (const [id, record] of downloads) if (now() >= record.expiresAt) {
      downloads.delete(id);
      await unlink(record.filePath).catch(() => {});
    }
    const fileId = randomUUID();
    const filePath = path.join(outDir, `${fileId}.pdf`);
    await makeReportPDF({ filePath, title: body.title, sections: body.sections });
    const token = randomBytes(32).toString('hex');
    const expiresAt = now() + 15 * 60 * 1000;
    downloads.set(fileId, { filePath, token, expiresAt });
    res.json({ ok: true, pdfUrl: `${origin.origin}/downloads/${fileId}?token=${token}`, expiresAt: new Date(expiresAt).toISOString() });
  }));
  app.use((_, res) => error(res, 404, 'Route not found'));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.too.large') return error(res, 413, 'Request too large');
    if (err.type === 'entity.parse.failed') return error(res, 400, 'Invalid JSON');
    return error(res, 500, 'Request failed');
  });
  return app;
}
