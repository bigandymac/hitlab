import { writeFile } from 'node:fs/promises';
import { makeOpenAPI } from '../openapi.js';

const baseUrl = process.env.BASE_URL || 'https://hitlab-api.example.invalid';
const url = new URL(baseUrl);
if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('BASE_URL must be an HTTPS origin');
await writeFile('hitlab-actions.openapi.json', JSON.stringify(makeOpenAPI(url.origin), null, 2) + '\n');
console.log(url.hostname.endsWith('.invalid') ? 'Draft schema generated: replace the reserved .invalid origin before installation.' : 'Schema generated for configured HTTPS origin.');
