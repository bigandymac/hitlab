import 'dotenv/config';
import path from 'node:path';
import { createApp } from './actions-app.js';

const port = Number(process.env.PORT || 8080);
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
if (process.env.NODE_ENV === 'production' && !baseUrl.startsWith('https://')) throw new Error('Production BASE_URL must use HTTPS');
if (process.env.DATABASE_URL?.includes('://')) throw new Error('Use DATABASE_FILE; PostgreSQL is not supported by this pilot');
const app = await createApp({ apiKey: process.env.HITLAB_ACTIONS_KEY, baseUrl, dbFile: path.resolve(process.env.DATABASE_FILE || 'data/projects.db'), outDir: path.resolve(process.env.REPORT_DIR || 'data/reports') });
app.listen(port, () => console.log(`HitLab Actions API listening on port ${port}`));
