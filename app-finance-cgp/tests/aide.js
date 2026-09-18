/** Chargement des tables de paramètres pour les tests (Node). */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');

export function lireJSON(chemin) {
  return JSON.parse(readFileSync(join(racine, chemin), 'utf8'));
}

export function donnees() {
  return {
    baremeFondsEuros: lireJSON('data/bareme-fonds-euros.json'),
    parametresFiscaux: lireJSON('data/parametres-fiscaux.json'),
    baremeIR: lireJSON('data/bareme-ir.json'),
    tableRente: lireJSON('data/table-rente.json'),
  };
}
