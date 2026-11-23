import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { CatalogRepository } from '../src/modules/catalog/repository.js';

const catalog = {
  categories: async () => [],
  species: async () => [],
  speciesBySlug: async () => null,
  media: async () => [],
  careActions: async () => [],
  guides: async () => [],
} as CatalogRepository;

test('health and database health report their actual states', async () => {
  const app = createApp({ frontendOrigin: 'http://localhost:3000', checkDatabase: async () => {}, catalog });
  assert.equal((await request(app).get('/api/v1/health')).body.success, true);
  assert.equal((await request(app).get('/api/v1/health/database')).status, 200);
  const failed = createApp({ frontendOrigin: 'http://localhost:3000', checkDatabase: async () => { throw Error('secret'); }, catalog });
  const response = await request(failed).get('/api/v1/health/database');
  assert.equal(response.status, 503);
  assert.doesNotMatch(JSON.stringify(response.body), /secret/);
});

test('catalog routes validate slugs and report missing species', async () => {
  const app = createApp({ frontendOrigin: 'http://localhost:3000', checkDatabase: async () => {}, catalog });
  assert.deepEqual((await request(app).get('/api/v1/categories')).body.data, []);
  assert.equal((await request(app).get('/api/v1/species')).status, 200);
  assert.equal((await request(app).get('/api/v1/species/unknown')).status, 404);
  assert.equal((await request(app).get('/api/v1/species/INVALID!')).status, 400);
  assert.equal((await request(app).get('/api/v1/nope')).status, 404);
});

test('catalog database failures do not disclose internals', async () => {
  const broken = { ...catalog, categories: async () => { throw Error('SQL private detail'); } };
  const app = createApp({ frontendOrigin: 'http://localhost:3000', checkDatabase: async () => {}, catalog: broken });
  const original = console.error;
  console.error = () => {};
  try {
    const response = await request(app).get('/api/v1/categories');
    assert.equal(response.status, 500);
    assert.doesNotMatch(JSON.stringify(response.body), /SQL private detail/);
  } finally {
    console.error = original;
  }
});
