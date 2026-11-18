/** @type {import('lint-staged').Configuration} */
const isGenerated = (file) => {
  const f = file.replaceAll('\\', '/');
  return (
    f.includes('/libs/shared/src/lib/generated/') ||
    f.endsWith('/Contracts/Wire.g.cs') ||
    f.endsWith('/Contracts/WireRoutingKeys.g.cs') ||
    f.endsWith('/models/wire_gen.go') ||
    f.endsWith('/rabbitmq/routing_gen.go')
  );
};

export default {
  '*.{ts,tsx,js,mjs,cjs}': (files) => {
    const targets = files.filter((f) => !isGenerated(f));
    if (targets.length === 0) return [];
    const list = targets.join(' ');
    return [
      `eslint --fix --no-warn-ignored ${list}`,
      `prettier --write ${list}`,
    ];
  },
  '*.{json,md,yml,yaml,css,html}': ['prettier --write'],
  '*.go': (files) => {
    const targets = files.filter((f) => !isGenerated(f));
    if (targets.length === 0) return [];
    return [`node scripts/lint-staged-go.mjs ${targets.join(' ')}`];
  },
  '*.{cs,csproj}': (files) => {
    const targets = files.filter((f) => !isGenerated(f));
    if (targets.length === 0) return [];
    return [`node scripts/lint-staged-dotnet.mjs ${targets.join(' ')}`];
  },
};
