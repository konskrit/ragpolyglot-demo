import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const schemaPath = join(__dirname, 'schemas/wire.schema.json');
const routingPath = join(__dirname, 'schemas/routing-keys.json');
const generatePath = join(__dirname, 'generate.mjs');

const outputs = {
  ts: join(root, 'libs/shared/src/lib/generated/wire.ts'),
  cs: join(root, 'apps/document-service/Contracts/Wire.g.cs'),
  go: join(root, 'apps/rag-worker/models/wire_gen.go'),
  routingTs: join(root, 'libs/shared/src/lib/generated/routing.ts'),
  routingCs: join(root, 'apps/document-service/Contracts/WireRoutingKeys.g.cs'),
  routingGo: join(root, 'apps/rag-worker/rabbitmq/routing_gen.go'),
};

describe('contracts codegen', () => {
  it('schema marks maxContextChars as nullable integer', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const props =
      schema.$defs.DocumentSummarizeEvent.properties.maxContextChars;
    assert.deepEqual(props.type, ['integer', 'null']);
  });

  it('routing-keys cover summarize + ingest events', () => {
    const keys = JSON.parse(readFileSync(routingPath, 'utf8')).map(
      (r) => r.key,
    );
    for (const key of [
      'document.uploaded',
      'document.summarize',
      'document.summarize.failed',
    ]) {
      assert.ok(keys.includes(key), `missing routing key ${key}`);
    }
  });

  it('committed outputs match quicktype + routing generation', () => {
    const result = spawnSync(process.execPath, [generatePath, '--check'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(
      result.status,
      0,
      result.stderr || result.stdout || 'contracts:check failed',
    );
  });

  it('generated languages keep summarize nullability aligned', () => {
    const ts = readFileSync(outputs.ts, 'utf8');
    const cs = readFileSync(outputs.cs, 'utf8');
    const go = readFileSync(outputs.go, 'utf8');

    assert.match(ts, /maxContextChars\?:\s*number\s*\|\s*null/);
    assert.match(cs, /public int\? MaxContextChars/);
    assert.match(go, /MaxContextChars\s+\*int\b/);
  });

  it('generated routing keys stay aligned across languages', () => {
    const ts = readFileSync(outputs.routingTs, 'utf8');
    const cs = readFileSync(outputs.routingCs, 'utf8');
    const go = readFileSync(outputs.routingGo, 'utf8');
    assert.match(ts, /Summarize:\s*'document\.summarize'/);
    assert.match(cs, /Summarize = "document\.summarize"/);
    assert.match(go, /RoutingSummarize\s*=\s*"document\.summarize"/);
  });

  it('schema includes gateway WS + RAG query shapes', () => {
    const ts = readFileSync(outputs.ts, 'utf8');
    assert.match(ts, /export interface RAGQueryDto/);
    assert.match(ts, /export interface DocumentStatusUpdate/);
    assert.match(ts, /export interface ChatCompletePayload/);
    assert.match(ts, /chunkContent:/);
  });
});
