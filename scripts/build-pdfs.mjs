// Renders the submission documents to PDF: Markdown → HTML (marked) → PDF (Chromium),
// with Mermaid diagrams rendered in the page first.
//
//   node scripts/build-pdfs.mjs            → submission/*.pdf
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'submission');
mkdirSync(out, { recursive: true });

const REPO = 'https://github.com/Georgian-86/lld-practice/blob/main/';
const LIVE = 'https://blueprint-lld.onrender.com';
const read = (p) => readFileSync(resolve(root, p), 'utf8');

/** Relative repo links become GitHub links; badges (remote images) are dropped. */
function prepare(md) {
  return md
    .replace(/^\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)\s*\n/gm, '')
    .replace(/\]\((?!https?:|#|mailto:)([^)]+)\)/g, (_, p) => `](${REPO}${p.replace(/^\.\//, '')})`);
}

function html(title, body, { compact = false } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4; margin: ${compact ? '13mm 15mm' : '16mm 17mm'}; }
  :root { --ink:#1f2330; --muted:#5b6275; --line:#dfe3ec; --accent:#4338ca; --soft:#f4f5fb; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Liberation Sans', 'DejaVu Sans', Arial, sans-serif; color: var(--ink);
         font-size: ${compact ? '9.6pt' : '10pt'}; line-height: ${compact ? 1.38 : 1.45}; margin: 0; }
  .masthead { display:flex; justify-content:space-between; align-items:baseline; border-bottom: 2px solid var(--accent);
              padding-bottom: 4px; margin-bottom: ${compact ? '8px' : '12px'}; color: var(--muted); font-size: 8.5pt; }
  .masthead b { color: var(--accent); letter-spacing: .02em; }
  h1 { font-size: ${compact ? '16pt' : '18pt'}; margin: 0 0 ${compact ? '6px' : '10px'}; color: #111827; }
  h2 { font-size: ${compact ? '11.5pt' : '12.5pt'}; margin: ${compact ? '10px' : '16px'} 0 4px; color: var(--accent);
       border-bottom: 1px solid var(--line); padding-bottom: 2px; break-after: avoid; }
  h3 { font-size: 10.5pt; margin: 10px 0 3px; break-after: avoid; }
  p { margin: ${compact ? '3px 0 5px' : '4px 0 7px'}; }
  ul, ol { margin: 3px 0 6px; padding-left: 18px; }
  li { margin: ${compact ? '1px' : '2px'} 0; }
  a { color: var(--accent); text-decoration: none; }
  code { font-family: 'DejaVu Sans Mono', monospace; font-size: 85%; background: var(--soft); padding: 0 3px; border-radius: 3px; }
  pre { background: var(--soft); border: 1px solid var(--line); border-radius: 5px; padding: 7px 9px; overflow: hidden;
        font-size: 7.4pt; line-height: 1.3; white-space: pre-wrap; break-inside: avoid; }
  pre code { background: none; padding: 0; font-size: inherit; }
  table { border-collapse: collapse; width: 100%; margin: 5px 0 9px; font-size: ${compact ? '8.4pt' : '8.8pt'}; break-inside: auto; }
  th, td { border: 1px solid var(--line); padding: ${compact ? '3px 5px' : '4px 6px'}; vertical-align: top; text-align: left; }
  th { background: var(--soft); }
  tr { break-inside: avoid; }
  blockquote { margin: 6px 0; padding: 4px 10px; border-left: 3px solid var(--accent); background: var(--soft); color: var(--muted); }
  .mermaid { text-align: center; margin: 8px 0; break-inside: avoid; }
  p:has(+ .mermaid), p:has(+ pre) { break-after: avoid; }
  .mermaid svg { max-width: 100%; height: auto; max-height: 190mm; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 12px 0; }
  .doc-break { break-before: page; }
</style></head><body>
<div class="masthead"><span><b>Blueprint</b> · LLD practice with explainable feedback</span><span>${LIVE.replace('https://', '')} · github.com/Georgian-86/lld-practice</span></div>
${body}
</body></html>`;
}

const MERMAID = resolve(root, 'node_modules/mermaid/dist/mermaid.min.js');

/** Turns ```mermaid blocks into rendered SVG diagrams. */
async function renderMermaid(page) {
  if (!(await page.locator('pre > code.language-mermaid').count())) return;
  await page.addScriptTag({ path: MERMAID });
  await page.evaluate(async () => {
    document.querySelectorAll('pre > code.language-mermaid').forEach((c) => {
      const d = document.createElement('div');
      d.className = 'mermaid';
      d.textContent = c.textContent;
      c.parentElement.replaceWith(d);
    });
    window.mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose', fontFamily: 'Liberation Sans, Arial' });
    await window.mermaid.run({ querySelector: '.mermaid' });
  });
}

const docs = [
  { file: 'Research_Note.pdf', title: 'Research note', parts: ['docs/RESEARCH.md'], compact: true },
  { file: 'Design_Note.pdf', title: 'Design note', parts: ['docs/DESIGN.md'] },
  { file: 'README_and_AI_USAGE.pdf', title: 'README and AI usage', parts: ['README.md', 'AI_USAGE.md'] },
];

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined });
for (const doc of docs) {
  const body = doc.parts.map((p, i) => `<section class="${i ? 'doc-break' : ''}">${marked.parse(prepare(read(p)))}</section>`).join('\n');
  const page = await browser.newPage();
  await page.setContent(html(doc.title, body, doc), { waitUntil: 'load' });
  await renderMermaid(page);
  await page.pdf({
    path: resolve(out, doc.file),
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;font-size:7pt;color:#8a90a2;padding:0 17mm;display:flex;justify-content:space-between;font-family:Arial"><span>${doc.title}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  await page.close();
  console.log(`✓ submission/${doc.file}`);
}
await browser.close();
