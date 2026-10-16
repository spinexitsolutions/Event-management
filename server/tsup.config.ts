import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/scripts/seed.ts', 'src/scripts/createAdmin.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // Bundle the workspace package (TypeScript source); keep real npm deps external.
  noExternal: ['@maison/shared'],
});
