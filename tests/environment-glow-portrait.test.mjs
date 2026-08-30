import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const styles = path.join(here, '..', 'apps', 'web', 'src', 'styles');

const read = (f) => readFile(path.join(styles, f), 'utf8');

const PORTRAIT_RE = /@media\s*\(max-width:\s*767px\)\s*and\s*\(orientation:\s*portrait\)\s*\{([\s\S]*?)\n\}/;

test('竖屏光斑尺寸不得使用 vmax（vmax 在竖屏等于视口高度）', async () => {
  const tokens = await read('tokens.css');
  const m = tokens.match(PORTRAIT_RE);
  assert.ok(m, '找不到竖屏 override 块');
  const block = m[1];
  assert.ok(!/vmax/.test(block), '竖屏块内出现 vmax，会渲染成整屏黄色圆盘');
  for (const k of ['a', 'b', 'c']) {
    const re = new RegExp('--ops-glow-' + k + '-size:\\s*[\\d.]+vw');
    assert.match(block, re, `竖屏 --ops-glow-${k}-size 必须是 vw 基准`);
  }
});

test('竖屏核心 alpha 必须显著低于横屏', async () => {
  const tokens = await read('tokens.css');
  const portrait = tokens.match(PORTRAIT_RE)[1];
  const root = tokens.slice(0, tokens.indexOf('@media (max-width: 767px) and (orientation: portrait)'));
  for (const k of ['a', 'b', 'c']) {
    const re = new RegExp('--ops-glow-' + k + '-core:\\s*([\\d.]+)');
    const pv = parseFloat(portrait.match(re)[1]);
    const rv = parseFloat(root.match(re)[1]);
    assert.ok(pv < rv * 0.5, `竖屏 ${k} core alpha ${pv} 未低于横屏 ${rv} 的一半`);
  }
});

test('.env-blob-* 规则只引用 token，不得内联尺寸或 alpha 字面量', async () => {
  const sys = await read('workshop-system.css');
  for (const k of ['a', 'b', 'c']) {
    const re = new RegExp('\\.workshop-runtime \\.env-blob-' + k + '\\s*\\{([\\s\\S]*?)\\n\\}');
    const rule = sys.match(re);
    assert.ok(rule, `找不到 .env-blob-${k} 规则`);
    const body = rule[1];
    assert.ok(!/\d+vmax|\d+vmin|\d+vw/.test(body), `.env-blob-${k} 内联了视口单位，尺寸必须来自 token`);
    assert.match(body, new RegExp('var\\(--ops-glow-' + k + '-size\\)'), `.env-blob-${k} 未引用 size token`);
    assert.match(body, new RegExp('var\\(--ops-glow-' + k + '-core\\)'), `.env-blob-${k} 未引用 core alpha token`);
  }
});

test('glow size/alpha token 只在 tokens.css 定义（单一来源）', async () => {
  const files = ['workshop-system.css', 'mobile-overview.css', 'desktop-workbench.css', 'frosted.css'];
  for (const f of files) {
    let css;
    try { css = await read(f); } catch { continue; }
    const re = /--ops-glow-[abc]-(size|core|mid)\s*:/g;
    assert.equal(css.match(re), null, `${f} 里重复定义了 glow size/alpha token`);
  }
});
