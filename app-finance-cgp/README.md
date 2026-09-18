# Simulateur Antevorta

Application web statique de simulation de projection de contrats d'assurance-vie et de capitalisation, destinée à un usage professionnel de conseiller en gestion de patrimoine. HTML, CSS et JavaScript (modules ES6), sans serveur ni installation : l'application s'exécute entièrement dans le navigateur.

## Accès

- Hébergement GitHub Pages : le dépôt contient le workflow `.github/workflows/pages.yml` qui exécute les tests puis publie le dossier `app-finance-cgp/`. Dans les réglages du dépôt, rubrique Pages, choisir la source « GitHub Actions ». L'adresse publiée est de la forme `https://<compte>.github.io/<dépôt>/`.
- Fichier unique hors ligne : `dist/simulateur-antevorta.html` regroupe l'application, les tables de paramètres et les bibliothèques. Il s'ouvre par double clic, sans connexion.
- En local avec un serveur : `python3 -m http.server 8080` dans ce dossier, puis `http://localhost:8080/`.

## Fonctionnalités

- Contrat : montant initial, durée, antériorité fiscale, reprise d'un contrat existant (primes avant et après le 27/09/2017, gains latents), allocation entre fonds en euros, unités de compte et produits structurés.
- Flux : versements programmés indexés, versements complémentaires, rachats programmés (montant ou pourcentage), chacun avec son taux de frais propre.
- Frais : frais sur versement et d'arbitrage bornés de 0,00 % à 3,00 % (curseur et champ), frais de gestion différenciés par compartiment.
- Fonds en euros : taux issu d'un barème à paliers croisant la part moyenne d'UC de l'exercice et l'encours total (seuil 150 000 €), évolution pluriannuelle et taux plancher. Barème dans `data/bareme-fonds-euros.json`.
- Unités de compte : rendement moyen et volatilité, Monte Carlo sur le contrat complet.
- Produits structurés : autocall, coupon avec effet mémoire, barrière de protection, réaffectation paramétrable des coupons et du capital.
- Arbitrages : ponctuels, rééquilibrage périodique, sécurisation progressive (linéaire ou par paliers). Le couplage avec le taux du fonds en euros est visible dans le tableau annuel et l'onglet Arbitrages.
- Avance : assiette 80 % fonds euros et 60 % UC, contrôle du plafond, intérêts composés ou simples, remboursement in fine, amortissable ou libre, tableau d'amortissement, coût, différentiel et alerte.
- Fiscalité en cas de vie : quote-part de gains, PFU et PFL selon la date des primes, abattement après 8 ans avec ordre d'imputation légal, option barème avec acompte et régularisation, prélèvements sociaux au fil de l'eau et au rachat, restitution au dénouement. Paramètres dans `data/parametres-fiscaux.json` et `data/bareme-ir.json`.
- Rente : conversion en rente viagère (table dans `data/table-rente.json`) et phase de consommation du capital.
- Optimiseur : courbe du rendement global selon la part d'UC, seuils de bascule, zones défavorables.
- Comparateurs : avance contre rachat partiel, scénarios côte à côte.
- Exports : Excel (SheetJS), synthèse client PDF de deux pages (jsPDF), configuration JSON.

## Arborescence

- `index.html`, `css/style.css`, `js/app.js` : interface (seul module manipulant le DOM).
- `js/models.js`, `frais.js`, `flux.js`, `fondsEuros.js`, `unitesCompte.js`, `structures.js`, `arbitrages.js`, `avance.js`, `fiscalite.js`, `projection.js`, `rente.js`, `optimiseur.js`, `comparateur.js`, `export.js` : moteur de calcul, sans dépendance au DOM. `aleatoire.js` (générateur reproductible) et `format.js` (typographie française) sont des utilitaires.
- `data/` : barèmes, paramètres fiscaux, table de rente, exemples génériques. Aucune donnée client.
- `tests/` : tests du moteur (`npm test`, Node 18 ou plus).
- `build.js` : génère `dist/simulateur-antevorta.html` (fichier unique). Les bibliothèques sont inlinées si le dossier `vendor/` contient `chart.js`, `xlsx.js` et `jspdf.js`, sinon chargées depuis leur CDN.

## Conventions de calcul

- Pas annuel. Versement initial et versements complémentaires en début d'exercice ; versements et rachats programmés en milieu d'exercice (capitalisés une demi-année).
- Le taux du fonds en euros de l'année N dépend de la part d'UC moyenne de l'année N (moyenne du début et de la fin d'exercice) et de l'encours de fin d'exercice, résolus par point fixe.
- Les frais de gestion sont prélevés sur l'encours moyen ; les prélèvements sociaux au fil de l'eau sur les intérêts nets de frais du fonds en euros.
- Les produits structurés ne sont souscrits qu'avec le versement initial (ou un versement complémentaire qui les cible) ; entre deux observations, leur valeur indicative est le nominal, ramené à la valeur de remboursement théorique sous la barrière.
- Performance brute : gains avant frais et prélèvements rapportés à l'encours moyen. Performance nette : variation de valeur nette des flux rapportée à l'encours moyen.
- Comparateur avance contre rachat : le patrimoine côté avance est la valeur du contrat diminuée de la dette et des remboursements décaissés ; le rachat brut est calibré pour procurer la même liquidité nette.

## Mise à jour des paramètres

Les taux et seuils sont révisés chaque année : modifier uniquement les fichiers du dossier `data/`, puis relancer `node build.js` pour la version fichier unique.
