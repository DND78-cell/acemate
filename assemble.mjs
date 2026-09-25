// Inline the artifact build (dist/artifact) into one page for claude.ai.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";

const dir = "dist/artifact/assets";
const files = readdirSync(dir);
// Literal U+FFFD (used by the Markdown parser) becomes an equivalent JS escape.
const js = readFileSync(`${dir}/${files.find((f) => f.endsWith(".js"))}`, "utf8").replace(/\uFFFD/g, "\\uFFFD");
const css = readFileSync(`${dir}/${files.find((f) => f.endsWith(".css"))}`, "utf8");
if (/<\/script/i.test(js) || /<!--/.test(js) || /<\/style/i.test(css)) {
  throw new Error("bundle contains a sequence that would break inline tags");
}

const themeBoot = `(function(){var t='graphite';try{var s=localStorage.getItem('acemate-theme-v2');if(s==='ocean'||s==='warm'||s==='light')t=s;}catch(e){}document.body.dataset.theme=t;})();`;

const html = `<title>AceMate</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap">
<style>
${css}
</style>
<script>${themeBoot}</script>
<div id="root"></div>
<script type="module">
${js}
</script>
`;
mkdirSync("out", { recursive: true });
writeFileSync("out/acemate.html", html);
console.log(`out/acemate.html ${(html.length / 1024).toFixed(0)} KB`);
