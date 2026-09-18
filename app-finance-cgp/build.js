/**
 * build.js : assemble une version « fichier unique » de l'application
 * (dist/simulateur-antevorta.html) utilisable hors ligne, sans serveur.
 *
 * Les modules ES6 sont concaténés dans l'ordre des dépendances (imports et
 * exports retirés), les tables de data/ sont injectées dans window.__DONNEES__
 * et les bibliothèques sont chargées depuis leur CDN (ou inlinées si un
 * dossier vendor/ contient chart.js, xlsx.js et jspdf.js).
 *
 * Usage : node build.js (CDN=1 node build.js pour charger les bibliothèques depuis leur CDN)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = dirname(fileURLToPath(import.meta.url));
const lire = (p) => readFileSync(join(racine, p), 'utf8');

const ORDRE = [
  'models', 'format', 'aleatoire', 'frais', 'flux', 'fondsEuros', 'unitesCompte', 'structures',
  'arbitrages', 'avance', 'fiscalite', 'projection', 'rente', 'optimiseur', 'comparateur', 'export', 'app',
];

function depouiller(code) {
  return code
    .replace(/^import\s[\s\S]*?from\s+'[^']+';\s*$/gm, '')
    .replace(/^export\s+(const|function|class|let)\s/gm, '$1 ')
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
}

const modules = ORDRE.map((m) => `// ---- js/${m}.js ----\n${depouiller(lire(`js/${m}.js`))}`).join('\n\n');

const donnees = {
  baremeFondsEuros: JSON.parse(lire('data/bareme-fonds-euros.json')),
  parametresFiscaux: JSON.parse(lire('data/parametres-fiscaux.json')),
  baremeIR: JSON.parse(lire('data/bareme-ir.json')),
  tableRente: JSON.parse(lire('data/table-rente.json')),
  exemples: JSON.parse(lire('data/exemples-contrats.json')).exemples,
};

const vendor = { chart: 'vendor/chart.js', xlsx: 'vendor/xlsx.js', jspdf: 'vendor/jspdf.js' };
const cdn = {
  chart: 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
};
const utiliserCDN = process.env.CDN === '1';
const scriptsLib = Object.keys(cdn).map((k) => (!utiliserCDN && existsSync(join(racine, vendor[k]))
  ? `<script src="data:text/javascript;base64,${Buffer.from(lire(vendor[k])).toString('base64')}"></script>`
  : `<script src="${cdn[k]}"></script>`)).join('\n');

let html = lire('index.html');
html = html.replace(/<script src="https:\/\/cdnjs[^"]+"><\/script>\s*/g, '');
// Remplacements par fonction : les motifs « $& », « $' » ou « $$ » du contenu
// injecté ne doivent pas être interprétés par String.replace.
html = html.replace('<link rel="stylesheet" href="css/style.css">', () => `<style>\n${lire('css/style.css')}\n</style>`);
html = html.replace('<script type="module" src="js/app.js"></script>',
  () => `${scriptsLib}\n<script>window.__DONNEES__ = ${JSON.stringify(donnees)};</script>\n<script>\n(() => {\n'use strict';\n${modules}\n})();\n</script>`);

mkdirSync(join(racine, 'dist'), { recursive: true });
writeFileSync(join(racine, 'dist', 'simulateur-antevorta.html'), html);
console.log(`dist/simulateur-antevorta.html : ${(html.length / 1024).toFixed(0)} ko`);
