import { execFileSync } from 'node:child_process';
import path from 'node:path';

const files = process.argv.slice(2).filter((f) => f.endsWith('.go'));
if (files.length === 0) process.exit(0);

execFileSync('gofmt', ['-w', ...files], { stdio: 'inherit' });

const modules = new Set();
for (const file of files) {
  const normalized = file.replaceAll('\\', '/');
  if (normalized.startsWith('apps/rag-worker/')) {
    modules.add('apps/rag-worker');
  } else if (normalized.startsWith('apps/event-processor/')) {
    modules.add('apps/event-processor');
  }
}

for (const mod of modules) {
  execFileSync('go', ['vet', './...'], {
    cwd: path.resolve(mod),
    stdio: 'inherit',
  });
}
