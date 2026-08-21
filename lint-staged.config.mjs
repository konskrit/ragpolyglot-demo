/** @type {import('lint-staged').Configuration} */
export default {
  '*.{ts,tsx,js,mjs,cjs}': [
    'eslint --fix --no-warn-ignored',
    'prettier --write',
  ],
  '*.{json,md,yml,yaml,css,html}': ['prettier --write'],
  '*.go': ['node scripts/lint-staged-go.mjs'],
  '*.{cs,csproj}': ['node scripts/lint-staged-dotnet.mjs'],
};
