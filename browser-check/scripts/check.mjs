// Cross-browser render check: per URL, browser and width, a full-page screenshot plus console
// errors, failed requests, horizontal overflow and broken images.
// node check.mjs <url|file> [url ...] [--site "<folder in websites/>"] [--out <dir>]
//                    [--browsers chrome,edge,firefox,webkit] [--widths desktop,mobile] [--wait 4000]
// <out> is websites/<site>/render in a websites/<site>/ repo, otherwise ./render.
// -> <out>/<chrome|edge|firefox|safari-webkit>/<slug>-<width>.png, <out>/browser-check.json
//    and <out>/compare/<slug>-<width>.html + -01.png ... (every browser side by side, one screenful each)
// Playwright is imported further down, after the one-time setup has made sure it is installed.
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, basename, sep, relative, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const USAGE = 'usage: node check.mjs <url|file> [url ...] [--site "<folder in websites/>"] [--out <dir>] [--browsers chrome,edge,firefox,webkit] [--widths desktop,mobile] [--wait 4000]';
const opt = { browsers: 'chrome,edge,firefox,webkit', widths: 'desktop,mobile', wait: '4000' };
const urls = [], localFiles = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i];
  else if (args[i].includes('://')) urls.push(args[i]);
  else { localFiles.push(resolve(args[i])); urls.push(pathToFileURL(resolve(args[i])).href); }
}
const stop = msg => { console.error(msg); process.exit(1); };
if (+process.versions.node.split('.')[0] < 20) stop(`Node 20 or newer is needed, this machine has ${process.versions.node}. Install the current LTS from nodejs.org and run again.`);

// Installed inside a project (<project>/.claude/skills/browser-check/), the skill belongs to that
// project only: it refuses to run from any other folder, and websites/ means the one in that project.
const skillDir = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const owner = skillDir.match(/^(.*)[\\/]\.claude[\\/]skills[\\/][^\\/]+$/);
const project = owner && resolve(owner[1]) !== resolve(homedir()) ? resolve(owner[1]) : null;
const within = (child, parent) => { const r = relative(parent, child); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };
if (project && !within(process.cwd(), project)) stop(`browser-check is installed for ${project} only and does not run in other folders (this was run from ${process.cwd()}). Nothing was run.`);

// Where the screenshots go. In a repo laid out as websites/<site>/..., they always land in that
// site's own render/ folder and never in the repo root. The site is, in order: --site "<folder>",
// the site folder the command is run from, the site folder a local file sits in, or the one folder
// whose name matches the URL's host. If none of those settles it, stop and ask for --site.
const siteOf = p => { const parts = p.split(sep); const i = parts.findLastIndex(s => s.toLowerCase() === 'websites'); return i >= 0 && parts[i + 1] ? parts.slice(0, i + 2).join(sep) : null; };
const pickOutDir = () => {
  if (opt.out) return resolve(opt.out);
  const cwd = process.cwd();
  const inSite = siteOf(cwd);
  const sitesDir = inSite ? join(inSite, '..') : [project, cwd].filter(Boolean).map(d => join(d, 'websites')).find(d => existsSync(d)) || null;
  if (!sitesDir) return opt.site ? stop(`--site needs to be run from the repo that holds the websites/ folder (ran from ${cwd})`) : resolve('render');
  const folders = readdirSync(sitesDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (opt.site) {
    const hit = folders.find(f => f.toLowerCase() === opt.site.toLowerCase()) || folders.find(f => norm(f) === norm(opt.site));
    if (hit) return join(sitesDir, hit, 'render');
    const near = folders.filter(f => norm(f).includes(norm(opt.site)) || norm(opt.site).includes(norm(f)));
    stop(`no folder "${opt.site}" in ${sitesDir}.${near.length ? ' Did you mean: ' + near.join(', ') + '?' : ''} Nothing was run.`);
  }
  if (inSite) return join(inSite, 'render');
  const fromFile = localFiles.map(siteOf).find(Boolean);
  if (fromFile) return join(fromFile, 'render');
  const web = urls.find(u => /^https?:/.test(u));
  const labels = web ? new URL(web).hostname.split('.').map(norm) : [];
  const match = folders.filter(f => labels.includes(norm(f)));
  if (match.length === 1) return join(sitesDir, match[0], 'render');
  stop(`cannot tell which site folder this belongs to${match.length ? ' (' + match.join(', ') + ' all match)' : ''}. Add --site "<folder name in websites/>". Nothing was run.`);
};
const outDir = pickOutDir();
const jsonFile = join(outDir, 'browser-check.json');
// With no URL, rebuild the compare sheets from the last run in <out> without loading any page again.
if (!urls.length && !existsSync(jsonFile)) stop(USAGE);
console.log('saving to', outDir);

// Chrome and Edge are the browsers installed on this machine. Firefox and WebKit are Playwright's
// own builds. WebKit is Safari's engine, not the Safari app, so it is never labelled plain "Safari".
const BROWSERS = {
  chrome: { dir: 'chrome', label: 'Chrome', launch: () => chromium.launch({ channel: 'chrome' }) },
  edge: { dir: 'edge', label: 'Edge', launch: () => chromium.launch({ channel: 'msedge' }) },
  firefox: { dir: 'firefox', label: 'Firefox', launch: () => firefox.launch() },
  webkit: { dir: 'safari-webkit', label: 'WebKit (Safari engine)', launch: () => webkit.launch() },
};
const VIEWPORTS = { desktop: { w: 1440, h: 900, mobile: false }, mobile: { w: 390, h: 844, mobile: true } };

const pick = (list, table, what) => list.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).map(n => {
  if (n === 'safari') n = 'webkit';
  if (!table[n]) { console.error(`unknown ${what}: ${n} (use ${Object.keys(table).join(', ')})`); process.exit(1); }
  return n;
});
const browsers = pick(opt.browsers, BROWSERS, 'browser');
const widths = pick(opt.widths, VIEWPORTS, 'width');

// The skill sets itself up, so nobody runs install commands by hand. First run on a machine: npm
// install in the skill folder. Then Playwright's Firefox and WebKit builds, if this run uses them and
// they are not on the machine yet. That second step also repeats itself after a Playwright update.
const setup =(cmd, why, env = {}) => {
  console.log(`one-time setup: ${why}`);
  try { execSync(cmd, { cwd: skillDir, stdio: 'inherit', env: { ...process.env, ...env } }); }
  catch { stop(`setup failed at "${cmd}" in ${skillDir}. Check the internet connection, then run the skill again.`); }
};
if (!existsSync(join(skillDir, 'node_modules', 'playwright'))) setup('npm install --no-fund --no-audit', 'installing Playwright', { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' });
const { chromium, firefox, webkit, devices } = await import('playwright');
const builds = { firefox, webkit };
const absent = n => { try { return !existsSync(builds[n].executablePath()); } catch { return true; } };
const missing = urls.length ? browsers.filter(n => builds[n] && absent(n)) : [];
if (missing.length) setup(`npx playwright install ${missing.join(' ')}`, `downloading the ${missing.join(' and ')} build${missing.length > 1 ? 's' : ''}, a few minutes`);

// Firefox has no mobile emulation in Playwright, so its mobile run is a narrow desktop window.
const contextOptions = (name, vp) => {
  const o = { viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 };
  if (vp.mobile && name !== 'firefox') {
    o.isMobile = true; o.hasTouch = true;
    o.userAgent = devices[name === 'webkit' ? 'iPhone 14' : 'Pixel 7'].userAgent;
  }
  return o;
};

const slug = u => {
  const { protocol, pathname } = new URL(u);
  const p = protocol === 'file:' ? basename(pathname).replace(/\.[a-z0-9]+$/i, '') : pathname;
  return decodeURIComponent(p).replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home';
};
const bust = u => u.startsWith('file:') ? u : u + (u.includes('?') ? '&' : '?') + 'cb=' + Date.now();

// Scrolls must be 'instant'. Sites with scroll-behavior:smooth animate a plain scrollTo, so the page
// is still travelling back to the top when the shot is taken and Chrome draws the fixed header mid-page.
const scrollAll = async step => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const H = () => document.documentElement.scrollHeight;
  for (let y = 0; y < Math.min(H(), 20000); y += step) { scrollTo({ top: y, behavior: 'instant' }); await sleep(200); }
  for (let i = 0; i < 20 && (i === 0 || scrollY > 0); i++) { scrollTo({ top: 0, behavior: 'instant' }); await sleep(150); }
  await sleep(1200);
};
const info = () => {
  const vw = document.documentElement.clientWidth;
  const over = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.right > vw + 2 && cs.position !== 'fixed' && cs.visibility !== 'hidden' && !e.closest('.w-nav-list,.l-subheader,[aria-hidden=true],.owl-stage,.w-slider,.slick-track,.royalSlider,.rsOverflow,.owl-carousel,.swiper-wrapper,.ti-widget'); }).slice(0, 6).map(e => e.tagName + '.' + (e.className || '').toString().split(' ').slice(0, 3).join('.') + ' r=' + Math.round(e.getBoundingClientRect().right));
  const broken = [...document.images].filter(i => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.src) && !/^data:/.test(i.currentSrc || i.src)).map(i => i.currentSrc || i.src);
  return { title: document.title, ua: navigator.userAgent, scrollY: Math.round(scrollY), docH: document.documentElement.scrollHeight, scrollW: document.documentElement.scrollWidth, vw, over, broken };
};

// Full-page capture, one real viewport at a time, then stitched. Not page.screenshot({ fullPage: true }):
// Chrome and Edge leave cross-origin iframes (embedded forms, maps, video) blank in a one-shot full-page
// capture, which reads as "missing in Chrome". After the first screen, fixed elements are hidden and
// sticky ones are pinned in place, so the header is not repeated down the page. Pages are capped at 20000px.
const hideStuck = () => {
  for (const e of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(e);
    // opacity, not visibility: themes set visibility:visible on header children, which un-hides them.
    if (cs.position === 'fixed') { e.dataset.bcHidden = '1'; e.style.setProperty('opacity', '0', 'important'); }
    else if (e.dataset.bcHidden) { delete e.dataset.bcHidden; e.style.removeProperty('opacity'); }
    // Sticky becomes relative: same space in the flow, drawn once where it sits instead of following the scroll.
    if (cs.position === 'sticky') { e.style.setProperty('position', 'relative', 'important'); e.style.setProperty('inset', 'auto', 'important'); }
  }
};
const capture = async (browser, page, file) => {
  const m = await page.evaluate(() => ({ docH: Math.min(document.documentElement.scrollHeight, 20000), step: Math.floor(visualViewport.height) }));
  const tmp = mkdtempSync(join(tmpdir(), 'bc-'));
  let html = '', width = 0, n = 0;
  for (let y = 0; y < m.docH; y += m.step) {
    const at = await page.evaluate(top => { scrollTo({ top, behavior: 'instant' }); return Math.round(scrollY); }, y);
    if (y > 0) await page.evaluate(hideStuck);
    await page.waitForTimeout(400);
    const buf = await page.screenshot();
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    // The last screen cannot scroll a full step, so it overlaps the one before. Drop the overlap.
    const crop = Math.max(0, Math.round((y - at) * h / m.step));
    writeFileSync(join(tmp, `${++n}.png`), buf);
    html += `<div style="height:${h - crop}px;overflow:hidden"><img src="${n}.png" style="display:block;margin-top:-${crop}px"></div>`;
    width = w;
  }
  writeFileSync(join(tmp, 'i.html'), `<!doctype html><body style="margin:0">${html}`);
  const sheet = await browser.newPage({ viewport: { width, height: 600 }, deviceScaleFactor: 1 });
  await sheet.goto(pathToFileURL(join(tmp, 'i.html')).href);
  await sheet.waitForFunction(() => [...document.images].every(i => i.complete));
  await sheet.screenshot({ path: file, fullPage: true });
  await sheet.close();
  rmSync(tmp, { recursive: true, force: true });
};

const results = urls.length ? [] : JSON.parse(readFileSync(jsonFile, 'utf8'));
const save = () => writeFileSync(jsonFile, JSON.stringify(results, null, 1));
mkdirSync(outDir, { recursive: true });

for (const name of urls.length ? browsers : []) {
  const B = BROWSERS[name];
  const dir = join(outDir, B.dir);
  mkdirSync(dir, { recursive: true });
  let browser;
  try { browser = await B.launch(); } catch (e) {
    results.push({ browser: name, label: B.label, error: 'launch failed: ' + e.message.split('\n')[0] }); save();
    console.log('ERR', name, 'launch failed:', e.message.split('\n')[0]);
    continue;
  }
  for (const w of widths) {
    const vp = VIEWPORTS[w];
    const context = await browser.newContext(contextOptions(name, vp));
    for (const u of urls) {
      const shot = join(dir, `${slug(u)}-${w}.png`);
      const r = { browser: name, label: B.label, version: browser.version(), width: w, viewport: `${vp.w}x${vp.h}`, url: u, console: [], failed: [] };
      if (vp.mobile && name === 'firefox') r.note = 'narrow desktop Firefox, not Firefox for Android';
      const page = await context.newPage();
      page.on('console', m => { if (m.type() === 'error') r.console.push('ERR ' + m.text().slice(0, 200)); });
      page.on('pageerror', e => r.console.push('EXC ' + String(e.message).split('\n')[0].slice(0, 200)));
      page.on('response', res => { if (res.status() >= 400) r.failed.push(res.status() + ' ' + res.url().slice(0, 160)); });
      page.on('requestfailed', q => { const t = q.failure()?.errorText || ''; if (!/abort|cancel/i.test(t)) r.failed.push('FAIL ' + t + ' ' + q.url().slice(0, 160)); });
      try {
        try { await page.goto(bust(u), { waitUntil: 'load', timeout: 60000 }); }
        catch (e) { if (!/Timeout/.test(e.message)) throw e; r.note = [r.note, 'load event not reached in 60s, captured anyway'].filter(Boolean).join('; '); }
        await page.waitForTimeout(+opt.wait);
        await page.evaluate(scrollAll, Math.round(vp.h * 0.7));
        Object.assign(r, await page.evaluate(info));
        try { await capture(browser, page, shot); }
        catch { await page.screenshot({ path: shot }); r.note = [r.note, 'full-page capture failed, first screen only'].filter(Boolean).join('; '); }
        r.screenshot = shot;
      } catch (e) { r.error = e.message.split('\n')[0]; }
      await page.close();
      r.console = [...new Set(r.console)]; r.failed = [...new Set(r.failed)];
      results.push(r); save();
      console.log(r.error ? 'ERR' : 'ok ', name.padEnd(7), w.padEnd(7), slug(u), r.error || `h=${r.docH} sideways=${Math.max(0, r.scrollW - r.vw)}px overflow=${r.over.length} broken=${r.broken.length} console=${r.console.length} failed=${r.failed.length}`);
    }
    await context.close();
  }
  await browser.close();
}

// Compare sheets: the same page and width in every browser, side by side. Full-page shots are far
// too tall to read whole, so each sheet is cut into one image per screenful.
const done = results.filter(r => r.screenshot);
const keyOf = r => `${slug(r.url)}-${r.width}`;
if (done.length) {
  const cdir = join(outDir, 'compare');
  mkdirSync(cdir, { recursive: true });
  const viewer = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
  for (const key of [...new Set(done.map(keyOf))]) {
    const set = done.filter(r => keyOf(r) === key);
    const col = set[0].width === 'mobile' ? 390 : 480, gap = 8, chunk = 1900, head = 30;
    for (const f of readdirSync(cdir)) if (f.startsWith(key + '-') && /-\d\d\.png$/.test(f)) rmSync(join(cdir, f));
    writeFileSync(join(cdir, key + '.html'), `<!doctype html><meta charset="utf-8"><title>${key}</title>
<style>body{margin:0;background:#888;font:14px/18px Arial,sans-serif}.row{display:flex;gap:${gap}px;align-items:flex-start;padding:0 ${gap}px}
.c{width:${col}px;flex:none}.c b{position:sticky;top:0;display:block;height:${head}px;box-sizing:border-box;background:#111;color:#fff;padding:6px 8px;overflow:hidden;white-space:nowrap}
.c img{width:100%;display:block}</style>
<div class="row">${set.map(r => `<div class="c"><b>${r.label} ${r.version}</b><img src="../${BROWSERS[r.browser].dir}/${key}.png" alt="${r.label}"></div>`).join('')}</div>`);
    const page = await viewer.newPage({ viewport: { width: set.length * col + (set.length + 1) * gap, height: chunk } });
    await page.goto(pathToFileURL(join(cdir, key + '.html')).href);
    await page.waitForFunction(() => [...document.images].every(i => i.complete));
    const H = await page.evaluate(() => document.documentElement.scrollHeight);
    let n = 0;
    for (let y = 0; y < H - head; y += chunk - head) {
      await page.evaluate(top => scrollTo(0, top), y);
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(cdir, `${key}-${String(++n).padStart(2, '0')}.png`) });
    }
    await page.close();
    console.log('compare', key, `${n} sheet(s)`, set.map(r => r.browser).join(' | '));
  }
  await viewer.close();
}
console.log('\nscreenshots, compare sheets and browser-check.json in', outDir);
process.exit(0);
