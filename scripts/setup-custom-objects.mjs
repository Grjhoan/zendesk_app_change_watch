#!/usr/bin/env node
/**
 * Repeatable, idempotent Custom Objects schema setup for Zendesk Change Watch.
 *
 * Reads schema/custom-objects.json and creates any missing custom objects and fields.
 *
 * Usage:
 *   node scripts/setup-custom-objects.mjs --dry-run
 *   ZENDESK_SUBDOMAIN=yoursub ZENDESK_EMAIL=you@co.com ZENDESK_API_TOKEN=xxx node scripts/setup-custom-objects.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');

const schemaPath = path.resolve(import.meta.dirname, '..', 'schema', 'custom-objects.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

if (isDryRun) {
  console.log(`Dry run — Zendesk Change Watch Custom Objects Schema v${schema.schemaVersion}`);
  for (const obj of schema.objects) {
    console.log(`\nObject: ${obj.key} (${obj.title} / ${obj.title_pluralized})`);
    for (const field of obj.fields) {
      console.log(`  - ${field.key} [${field.type}]: ${field.title}`);
    }
  }
  process.exit(0);
}

const subdomain = process.env.ZENDESK_SUBDOMAIN?.trim();
const email = process.env.ZENDESK_EMAIL?.trim();
const apiToken = process.env.ZENDESK_API_TOKEN?.trim();

if (!subdomain || !email || !apiToken) {
  console.error(
    'Missing required Zendesk credentials. Set ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, and ZENDESK_API_TOKEN, or run with --dry-run, or initialize the schema inside the app Diagnostics drawer using your signed-in browser session.'
  );
  process.exit(1);
}

const baseUrl = `https://${subdomain}.zendesk.com`;
const authHeader = `Basic ${Buffer.from(`${email}/token:${apiToken}`).toString('base64')}`;

async function zdRequest(endpoint, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 404) {
    return { status: 404, data: null };
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail = data?.description || data?.error || response.statusText;
    throw new Error(`Zendesk API ${response.status} on ${options.method || 'GET'} ${endpoint}: ${detail}`);
  }

  return { status: response.status, data };
}

async function run() {
  console.log(`Syncing Zendesk Change Watch schema v${schema.schemaVersion} to ${subdomain}.zendesk.com...`);

  const existingObjectsRes = await zdRequest('/api/v2/custom_objects');
  const existingKeys = new Set(
    (existingObjectsRes.data?.custom_objects || []).map((obj) => obj.key)
  );

  for (const objDef of schema.objects) {
    if (!existingKeys.has(objDef.key)) {
      console.log(`+ Creating custom object: ${objDef.key}`);
      await zdRequest('/api/v2/custom_objects', {
        method: 'POST',
        body: {
          custom_object: {
            key: objDef.key,
            title: objDef.title,
            title_pluralized: objDef.title_pluralized,
            description: objDef.description,
            include_in_list_view: objDef.include_in_list_view,
            allows_attachments: objDef.allows_attachments
          }
        }
      });
    } else {
      console.log(`= Custom object exists: ${objDef.key}`);
    }

    const fieldsRes = await zdRequest(`/api/v2/custom_objects/${objDef.key}/fields`);
    const existingFieldKeys = new Set(
      (fieldsRes.data?.custom_object_fields || []).map((f) => f.key)
    );

    for (const fieldDef of objDef.fields) {
      if (!existingFieldKeys.has(fieldDef.key)) {
        console.log(`  + Creating field: ${objDef.key}.${fieldDef.key} (${fieldDef.type})`);
        await zdRequest(`/api/v2/custom_objects/${objDef.key}/fields`, {
          method: 'POST',
          body: {
            custom_object_field: {
              key: fieldDef.key,
              title: fieldDef.title,
              type: fieldDef.type,
              description: fieldDef.description
            }
          }
        });
      } else {
        console.log(`  = Field exists: ${objDef.key}.${fieldDef.key}`);
      }
    }
  }

  console.log('\nSchema setup complete.');
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
