import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = fileURLToPath(new URL('./cloud-fixture.js', import.meta.url));
await build({ configFile: false, plugins: [react(), tailwindcss()], resolve: { alias: [
  { find: './lib/firebase', replacement: fixture },
  { find: 'firebase/auth', replacement: fixture },
  { find: 'firebase/firestore', replacement: fixture },
] }, build: { outDir: 'node_modules/.cache/portfolio-browser-tests', emptyOutDir: true } });
const server = await preview({ configFile: false, build: { outDir: 'node_modules/.cache/portfolio-browser-tests' }, preview: { port: 4178, strictPort: true } });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/quotes', route => route.fulfill({ json: [{ symbol: '2330.TW', regularMarketPrice: 150 }] }));
  await page.route('**/api/historical/**', route => route.fulfill({ json: { actualSymbol: '2330.TW', shortName: '台積電', close: 100 } }));
  await page.goto('http://localhost:4178');
  await page.getByRole('button', { name: '雲端甲', exact: true }).waitFor();

  // Reproduce a rejected deletion: modal must remain and retry targets doc.id.
  await page.getByTitle('刪除組合', { exact: true }).click();
  await page.evaluate(() => { window.cloudFixture.failure = 'permission-denied'; });
  await page.getByRole('button', { name: '確認刪除', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '帳號沒有操作' }).last().waitFor();
  assert.equal(await page.getByRole('button', { name: '雲端甲', exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => window.cloudFixture.writes.at(-1)[0].id), 'document-a');
  await page.evaluate(() => { window.cloudFixture.hold = true; window.cloudFixture.release = null; });
  await page.getByRole('button', { name: '確認刪除', exact: true }).click();
  await page.waitForFunction(() => !!window.cloudFixture.release);
  assert.equal(await page.getByRole('button', { name: '刪除中…', exact: true }).isDisabled(), true);
  await page.evaluate(() => window.cloudFixture.release());
  await page.getByRole('heading', { name: '確認刪除投資組合？' }).waitFor({ state: 'hidden' });
  await page.reload();
  await page.getByRole('button', { name: '雲端乙', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '雲端甲', exact: true }).count(), 0);

  // Create failure and delayed retry: no premature close or duplicate submission.
  await page.getByRole('button', { name: '組合', exact: true }).click();
  await page.locator('input[type=text]').fill('新組合');
  await page.evaluate(() => { window.cloudFixture.failure = 'permission-denied'; });
  await page.getByRole('button', { name: '確認', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '帳號沒有操作' }).last().waitFor();
  assert.equal(await page.locator('input[type=text]').inputValue(), '新組合');
  await page.evaluate(() => { window.cloudFixture.hold = true; window.cloudFixture.release = null; });
  await page.getByRole('button', { name: '確認', exact: true }).click();
  await page.waitForFunction(() => !!window.cloudFixture.release);
  assert.equal(await page.getByRole('button', { name: '儲存中…', exact: true }).isDisabled(), true);
  await page.evaluate(() => window.cloudFixture.release());
  await page.getByRole('heading', { name: '新增投資組合', exact: true }).waitFor({ state: 'hidden' });

  // Rename rejection retains the name, then success persists across reload.
  await page.getByTitle('修改組合名稱').click();
  await page.locator('input[type=text]').fill('更名組合');
  await page.evaluate(() => { window.cloudFixture.failure = 'permission-denied'; });
  await page.getByRole('button', { name: '確認', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '帳號沒有操作' }).last().waitFor();
  assert.equal(await page.locator('input[type=text]').inputValue(), '更名組合');
  await page.getByRole('button', { name: '確認', exact: true }).click();
  await page.getByRole('heading', { name: '重新命名組合', exact: true }).waitFor({ state: 'hidden' });
  await page.reload();
  await page.getByRole('button', { name: '更名組合', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => Object.values(window.cloudFixture.documents()).filter(p => p.name === '更名組合').length), 1);

  // Add and sell holdings through the authenticated transaction path.
  await page.getByRole('button', { name: '新增模擬部位', exact: true }).click();
  await page.locator('input[type=text]').fill('2330');
  await page.locator('input[type=number]').fill('1000');
  await page.locator('input[type=date]').fill('2026-09-18');
  await page.evaluate(() => { window.cloudFixture.failure = 'permission-denied'; });
  await page.getByRole('button', { name: '確認新增', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '帳號沒有操作' }).waitFor();
  assert.equal(await page.locator('input[type=text]').inputValue(), '2330');
  await page.getByRole('button', { name: '確認新增', exact: true }).click();
  await page.getByRole('button', { name: '平倉', exact: true }).click();
  await page.locator('input[type=number]').first().fill('400');
  await page.getByRole('button', { name: '確認賣出', exact: true }).click();
  await page.getByRole('heading', { name: '平倉 (賣出)', exact: true }).waitFor({ state: 'hidden' });
  const sold = await page.evaluate(() => Object.values(window.cloudFixture.documents()).find(p => p.name === '更名組合'));
  assert.equal(sold.positions[0].shares, 600);
  assert.equal(sold.closedPositions[0].realizedReturn, 20000);
  await page.getByTitle('刪除紀錄', { exact: true }).click();
  await page.getByText('尚無股票部位', { exact: true }).waitFor();
  await page.getByRole('button', { name: '已平倉', exact: true }).click();
  await page.getByTitle('刪除紀錄', { exact: true }).click();
  await page.getByText('尚無平倉紀錄', { exact: true }).waitFor();

  // Sort failure does not leave a fictitious order; success survives reload.
  await page.getByRole('button', { name: '橫向比較', exact: true }).click();
  const cards = page.locator('[draggable=true]');
  await page.evaluate(() => { window.cloudFixture.failure = 'permission-denied'; });
  await cards.nth(1).dragTo(cards.nth(0));
  await page.getByRole('alert').filter({ hasText: '帳號沒有操作' }).waitFor();
  assert.equal(await cards.first().locator('h3').innerText(), '雲端乙');
  await cards.nth(1).dragTo(cards.nth(0));
  await page.waitForFunction(() => Object.values(window.cloudFixture.documents()).find(p => p.name === '更名組合').sortOrder === 0);
  await page.reload();
  await page.getByRole('button', { name: '橫向比較', exact: true }).click();
  assert.equal(await cards.first().locator('h3').innerText(), '更名組合');

  // Authoritative empty server state must never re-upload a stale backup.
  const before = await page.evaluate(() => window.cloudFixture.writes.length);
  await page.evaluate(() => {
    localStorage.setItem('portfolios_test-user', JSON.stringify(Object.values(window.cloudFixture.documents())));
    window.cloudFixture.replace({});
  });
  await page.getByText('尚無投資組合，請按「＋ 組合」新增。', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.cloudFixture.writes.length), before);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('portfolios_test-user'))), []);
  assert.deepEqual(errors, []);
  console.log('PASS authenticated portfolio create, rename, delete, selection, sorting, holdings, rejection/retry, delayed writes, reload, stale backup and legacy document IDs');
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
