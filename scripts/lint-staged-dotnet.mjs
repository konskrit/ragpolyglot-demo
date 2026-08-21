import { execFileSync } from 'node:child_process';
import path from 'node:path';

const files = process.argv
  .slice(2)
  .filter((f) => f.endsWith('.cs') || f.endsWith('.csproj'));
if (files.length === 0) process.exit(0);

const projects = new Set();
for (const file of files) {
  const normalized = file.replaceAll('\\', '/');
  if (normalized.startsWith('apps/document-service.Tests/')) {
    projects.add('apps/document-service.Tests/document-service.Tests.csproj');
  } else if (normalized.startsWith('apps/document-service/')) {
    projects.add('apps/document-service/document-service.csproj');
  }
}

if (projects.size === 0) {
  projects.add('apps/document-service/document-service.csproj');
}

for (const project of projects) {
  execFileSync('dotnet', ['format', path.resolve(project)], {
    stdio: 'inherit',
  });
}
