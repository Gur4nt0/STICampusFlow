/* Builds dist/campusflow-preview.html: the whole app in ONE file, running in demo mode
   (same core logic, data kept in the browser). Run: node backend/tools/build-preview.js
   It reads the <link> and <script> tags in frontend/index.html, so new files added
   there are picked up automatically. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/<\/script/gi, '<\\/script');
let html = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');

// 1. Inline every local stylesheet, in the same order.
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, href) => `<style>/* ${href} */\n${read('frontend/' + href)}\n</style>`);

// 2. The preview has no back end: drop env.js and the logic.js loader, then put the
//    logic back in as a normal tag so step 3 inlines it.
html = html.replace(/\s*<!-- Where the back end is[\s\S]*?<\/script>\s*<!-- Shared business rules[^>]*>\s*<script>document\.write[^\n]*<\/script>/, '\n  <script src="/core/logic.js"></script>');

// 3. Inline every local script. The preview also needs the office config and the
//    in-memory database, which the real server provides instead.
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const files = [];
for (const src of srcs) {
  if (src === '/core/logic.js') files.push('backend/config.js', 'backend/core/logic.js', 'backend/core/repo-memory.js', 'backend/core/seed.js');
  else files.push('frontend/' + src);
}
const block = `<script>window.CAMPUSFLOW_DEMO = true;</script>\n` + files.map((s) => `<script>/* ${s} */\n${read(s)}\n</script>`).join('\n') + '\n<script>App.route();</script>';
html = html.replace(/<script src="\/core\/logic\.js"><\/script>[\s\S]*<script>App\.route\(\);<\/script>/, () => block);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/campusflow-preview.html'), html);
console.log('Wrote dist/campusflow-preview.html', (html.length / 1024).toFixed(0) + ' KB', `(${files.length} scripts)`);
