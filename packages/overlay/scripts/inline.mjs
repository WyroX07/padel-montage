// Regroupe la démo en un seul fichier HTML (JS et CSS en ligne) : dist/tableau-de-score.html.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../dist/", import.meta.url).pathname;
let html = readFileSync(join(dist, "index.html"), "utf8");
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/g, (_, f) =>
  `<style>${readFileSync(join(dist, f), "utf8")}</style>`,
);
html = html.replace(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/g, (_, f) =>
  `<script type="module">${readFileSync(join(dist, f), "utf8").replace(/<\/script/g, "<\\/script")}</script>`,
);
writeFileSync(join(dist, "tableau-de-score.html"), html);
console.log("dist/tableau-de-score.html", Math.round(html.length / 1024), "Ko");
