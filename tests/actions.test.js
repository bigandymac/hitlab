import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from '../actions-app.js';
import { makeOpenAPI } from '../openapi.js';

test('private Actions pilot integration', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'hitlab-actions-'));
  const apiKey = 'local-test-only-key-not-for-deployment';
  let clock = Date.now();
  const options = { apiKey, baseUrl: 'http://127.0.0.1', dbFile: path.join(dir, 'projects.db'), outDir: path.join(dir, 'reports'), now: () => clock };
  const app = await createApp(options);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (url, body, authorized = true) => fetch(origin + url, { method: body === undefined ? 'GET' : 'POST', headers: { ...(authorized ? { Authorization: `Bearer ${apiKey}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const sample = { title: 'Owned lyric test', data: { instructionVersion: 'HitLab-1.1', originalLyrics: 'I left the porch light on\nYou took the morning train', revisedLyrics: 'I left the porch light on\nYou caught the morning train', constraints: 'Keep line one exactly', decisions: 'Draft pending' } };
  let projectId;
  let downloadPath;
  try {
    await t.test('health is public; project reads and writes require authentication', async () => {
      assert.equal((await request('/health', undefined, false)).status, 200);
      assert.equal((await request('/projects', sample, false)).status, 401);
      assert.equal((await request('/projects/proj_00000000-0000-0000-0000-000000000000', undefined, false)).status, 401);
    });
    await t.test('save awaits persistence and reopen returns exact lyrics', async () => {
      const response = await request('/projects', sample);
      assert.equal(response.status, 201);
      projectId = (await response.json()).projectId;
      const project = (await (await request(`/projects/${projectId}`)).json()).project;
      assert.deepEqual(project.data, sample.data);
      assert.equal(project.title, sample.title);
    });
    await t.test('snapshots do not overwrite earlier revisions', async () => {
      const revision = structuredClone(sample);
      revision.data.decisions = 'Second revision';
      const other = await (await request('/projects', revision)).json();
      assert.notEqual(other.projectId, projectId);
      assert.equal((await (await request(`/projects/${projectId}`)).json()).project.data.decisions, 'Draft pending');
    });
    await t.test('saved projects survive a fresh application instance', async () => {
      const reopened = await createApp(options);
      const otherServer = reopened.listen(0, '127.0.0.1');
      await once(otherServer, 'listening');
      try {
        const response = await fetch(`http://127.0.0.1:${otherServer.address().port}/projects/${projectId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
        assert.equal((await response.json()).project.data.originalLyrics, sample.data.originalLyrics);
      } finally { await new Promise(resolve => otherServer.close(resolve)); }
    });
    await t.test('missing project gives 404 rather than a false successful empty result', async () => {
      assert.equal((await request('/projects/proj_00000000-0000-0000-0000-000000000000')).status, 404);
    });
    await t.test('rejects malformed and excessive project data', async () => {
      for (const body of [{}, { title: 'x', data: {} }, { title: 'x', data: { instructionVersion: '1', unknown: 'x' } }, { title: 'x', data: { instructionVersion: '1', originalLyrics: 'x'.repeat(8001) } }]) assert.equal((await request('/projects', body)).status, 400);
    });
    await t.test('PDF export rejects missing authentication and invalid sections', async () => {
      assert.equal((await request('/reports/export', { title: 'x', sections: [] }, false)).status, 401);
      assert.equal((await request('/reports/export', { title: 'x', sections: [] })).status, 400);
    });
    await t.test('same-titled exports return separate valid PDF downloads', async () => {
      const body = { title: 'Lyrical Surgeon', sections: [{ heading: 'Locked original', body: sample.data.originalLyrics }, { heading: 'Draft', body: sample.data.revisedLyrics }] };
      const first = await (await request('/reports/export', body)).json();
      const second = await (await request('/reports/export', body)).json();
      assert.notEqual(first.pdfUrl, second.pdfUrl);
      const url = new URL(first.pdfUrl);
      downloadPath = url.pathname + url.search;
      const response = await request(downloadPath, undefined, false);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
    });
    await t.test('static files are not publicly served and invalid download tokens fail', async () => {
      assert.equal((await request('/static/example.pdf', undefined, false)).status, 401);
      assert.equal((await request(downloadPath.replace(/token=.*/, 'token=wrong'), undefined, false)).status, 404);
      assert.equal((await request(downloadPath.split('?')[0], undefined, false)).status, 404);
    });
    await t.test('download expires after fifteen minutes', async () => {
      clock += 15 * 60 * 1000;
      assert.equal((await request(downloadPath, undefined, false)).status, 410);
    });
    await t.test('weak authentication configuration fails closed', async () => {
      await assert.rejects(createApp({ ...options, apiKey: 'weak' }), /32 characters/);
    });
    await t.test('OpenAPI operation names map to the implemented routes', () => {
      const schema = makeOpenAPI('https://hitlab-api.example.invalid');
      assert.deepEqual(Object.keys(schema.paths), ['/health', '/projects', '/projects/{projectId}', '/reports/export']);
      assert.equal(schema.paths['/projects'].post.operationId, 'saveHitLabProject');
      assert.equal(schema.paths['/projects'].post['x-openai-isConsequential'], true);
      assert.equal(schema.paths['/reports/export'].post.operationId, 'exportHitLabReport');
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
