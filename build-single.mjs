// Bundles dist/ into one self-contained HTML file (for sharing as a single page).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const assets = readdirSync('dist/assets');
const js = readFileSync('dist/assets/' + assets.find((f) => f.endsWith('.js')), 'utf8');
const css = readFileSync('dist/assets/' + assets.find((f) => f.endsWith('.css')), 'utf8');
const html = `<title>Formicarium</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IM+Fell+English&family=Silkscreen&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>${css}</style>
<div id="app"></div>
<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>
`;
writeFileSync('dist/formicarium-single.html', html);
console.log('wrote dist/formicarium-single.html', html.length, 'bytes');
