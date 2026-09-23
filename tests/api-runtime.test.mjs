import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

test('Compiled API starts in native Node ESM and responds without a bundler', async () => {
  // Vite/esbuild bundle imports locally, masking missing extensions in serverless output.
  await mkdir('build', { recursive: true });
  const output = await mkdtemp(resolve('build/api-runtime-'));
  try {
    for (const file of ['api/index.ts', 'src/lib/historical.ts']) {
      const source = await readFile(file, 'utf8');
      const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      const destination = resolve(output, file.replace(/\.ts$/, '.js'));
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, compiled);
    }
    const entry = pathToFileURL(resolve(output, 'api/index.js')).href;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import app from ${JSON.stringify(entry)};
      const server = app.listen(0, '127.0.0.1');
      await new Promise(resolve => server.once('listening', resolve));
      try {
        const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/historical/2330/not-a-date');
        if (response.status !== 400 || !(await response.json()).error) process.exitCode = 1;
      } finally { server.closeAllConnections(); server.close(); }
    `], { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
