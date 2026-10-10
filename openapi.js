const field = (description, maxLength = 8000) => ({ type: 'string', description, maxLength });
export const projectFields = {
  instructionVersion: field('Instruction configuration version, e.g. HitLab-1.1', 80),
  brief: field('Genre, intended listener and task'),
  originalLyrics: field('Artist supplied original lyrics; preserve verbatim'),
  revisedLyrics: field('Proposed revision, labelled as a draft'),
  approvedLyrics: field('Only text the artist explicitly accepted'),
  constraints: field('Locked lines, facts, point of view and artist identity'),
  diagnosis: field('Single primary issue and evidence'),
  editNotes: field('Original-to-proposed changes with reasons'),
  decisions: field('Artist accept/reject decisions and feedback'),
  sunoPrompt: field('Style prompt and lyrics handoff with uncertainty labels')
};
const errorSchema = { type: 'object', properties: { ok: { type: 'boolean' }, error: { type: 'string' } }, required: ['ok', 'error'] };
const jsonResponse = (description, schema) => ({ description, content: { 'application/json': { schema } } });
const errors = Object.fromEntries(['400', '401', '413', '429', '500'].map(code => [code, jsonResponse('Request rejected or failed', errorSchema)]));
const dataSchema = { type: 'object', properties: projectFields, required: ['instructionVersion'], additionalProperties: false };
const projectSchema = { type: 'object', properties: { id: { type: 'string' }, title: field('Project title', 160), data: dataSchema, savedAt: { type: 'string', format: 'date-time' } }, required: ['id', 'title', 'data', 'savedAt'], additionalProperties: false };

export function makeOpenAPI(baseUrl) {
  return {
    openapi: '3.1.0',
    info: { title: 'HitLab private pilot Actions', version: '1.1.0', description: 'Save and reopen immutable music project snapshots and export GPT-drafted reports. Single owner private pilot; this API does not analyse audio or generate music.' },
    servers: [{ url: baseUrl }],
    security: [{ bearerAuth: [] }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
    paths: {
      '/health': { get: { operationId: 'checkHitLabHealth', summary: 'Check whether the HitLab API is running', security: [], responses: { '200': jsonResponse('Service status', { type: 'object', properties: { ok: { type: 'boolean' }, service: { type: 'string' }, version: { type: 'string' } }, required: ['ok', 'service', 'version'] }) } } },
      '/projects': { post: {
        operationId: 'saveHitLabProject', summary: 'Save a new immutable snapshot after the artist asks to save', 'x-openai-isConsequential': true,
        description: 'A successful response creates a new project ID. No previous snapshot is overwritten. Retain the original lyrics and only include approvedLyrics if the artist accepted that text. Each project data field is text; total data at most 32000 characters. Saving stores the content on the HitLab server.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { title: { ...field('Project name', 160), minLength: 1 }, data: dataSchema }, required: ['title', 'data'], additionalProperties: false } } } },
        responses: { '201': jsonResponse('Snapshot saved', { type: 'object', properties: { ok: { type: 'boolean' }, projectId: { type: 'string' }, savedAt: { type: 'string', format: 'date-time' } }, required: ['ok', 'projectId', 'savedAt'] }), ...errors }
      } },
      '/projects/{projectId}': { get: {
        operationId: 'openHitLabProject', summary: 'Reopen a saved project using its exact returned ID',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string', pattern: '^proj_[0-9a-f-]{36}$' } }],
        responses: { '200': jsonResponse('Saved snapshot', { type: 'object', properties: { ok: { type: 'boolean' }, project: projectSchema }, required: ['ok', 'project'] }), '404': jsonResponse('Project not found', errorSchema), ...errors }
      } },
      '/reports/export': { post: {
        operationId: 'exportHitLabReport', summary: 'Export an artist-requested draft or approved report as a PDF', 'x-openai-isConsequential': true,
        description: 'Use content already shown to the artist. The API formats supplied text; it does not perform an AI review. Returned download link works for 15 minutes; anyone holding it can read the PDF. Total request content at most 32000 characters.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { title: { ...field('Report title', 160), minLength: 1 }, sections: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'object', properties: { heading: { ...field('Section heading', 160), minLength: 1 }, body: { ...field('Section text', 8000), minLength: 1 } }, required: ['heading', 'body'], additionalProperties: false } } }, required: ['title', 'sections'], additionalProperties: false } } } },
        responses: { '200': jsonResponse('Temporary PDF download', { type: 'object', properties: { ok: { type: 'boolean' }, pdfUrl: { type: 'string', format: 'uri' }, expiresAt: { type: 'string', format: 'date-time' } }, required: ['ok', 'pdfUrl', 'expiresAt'] }), ...errors }
      } }
    }
  };
}
