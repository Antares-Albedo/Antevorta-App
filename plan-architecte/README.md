# Plan Architecte 2D/3D

Application web qui génère automatiquement un plan d'architecte 2D coté et une maquette 3D navigable à 360° à partir de simples mesures de pièces. Le plan, la 3D et le tableau des surfaces sont produits à partir d'un modèle de données unique et restent synchronisés en temps réel.

- Plan 2D vectoriel (SVG) au rendu d'architecte : murs pochés ou hachurés, portes avec arc de débattement, fenêtres en double trait, cotations extérieures et intérieures, flèche du nord, échelle graphique, cartouche avec tableau des surfaces.
- Maquette 3D (Three.js) : murs extrudés avec découpe réelle des ouvertures, sols différenciés (parquet, carrelage), menuiseries avec vitrage, rotation 360°, vues prédéfinies, maquette ouverte, mode visite à hauteur d'œil, rotation automatique.
- Panneau « Surfaces » mis à jour instantanément : surface nette de chaque pièce, surface habitable, surface annexe, total au sol.
- Pièces rectangulaires ou polygonales (L, T, U, pan coupé, murs biais) avec fermeture automatique et contrôle des angles.
- Exports SVG, PNG, PDF (A4/A3, 1/50 ou 1/100), JSON du projet, capture PNG de la 3D.
- Sauvegarde automatique, annuler/rétablir, gestion de plusieurs projets, guide de prise en main, application installable (PWA) et utilisable hors ligne.

## Installation

Prérequis : [Node.js](https://nodejs.org) version 20 ou supérieure (version LTS recommandée).

```bash
cd plan-architecte
npm install
npm run dev
```

L'application est disponible sur http://localhost:5173.

## Lancement par double-clic (sans terminal)

- Windows : double-cliquez sur `lancer.bat`.
- macOS : double-cliquez sur `lancer.command` (au premier lancement, si macOS bloque le fichier, faites clic droit puis « Ouvrir »).

Le script installe les dépendances si nécessaire, démarre l'application et ouvre le navigateur. Laissez la fenêtre du terminal ouverte pendant l'utilisation.

## Déploiement en ligne en un clic

Le dossier `plan-architecte` contient `vercel.json` et `netlify.toml`.

- Vercel : importez le dépôt, indiquez `plan-architecte` comme « Root Directory ». La configuration (build `npm run build`, dossier `dist`) est lue automatiquement.
- Netlify : importez le dépôt, indiquez `plan-architecte` comme « Base directory ». Le fichier `netlify.toml` fournit la commande de build et le dossier de publication.

Une fois en ligne, l'application peut être installée sur ordinateur ou tablette depuis le navigateur (Chrome, Edge, Safari) et fonctionne hors ligne.

## Utilisation pas à pas

1. Écran d'accueil : choisissez « Nouveau projet », « Ouvrir un projet » ou « Charger l'exemple » (T3 avec séjour en L et cuisine à pan coupé).
2. Panneau de gauche : renseignez le nom du projet, la hauteur sous plafond et les épaisseurs de murs si besoin. Choisissez un type de pièce puis « Ajouter ».
3. Cliquez sur une pièce de la liste pour ouvrir son formulaire :
   - Rectangle : longueur et largeur intérieures (de mur à mur).
   - Polygone : liste de côtés (longueur et angle intérieur avec le côté suivant). Utilisez les modèles L, T, U ou pan coupé puis modifiez les valeurs. L'aperçu miniature et l'écart de fermeture sont affichés en direct. Si l'écart est inférieur à 5 cm, un bouton ajuste le dernier côté ; au-delà, un message d'erreur bloque la pièce.
   - Ouvertures : ajoutez portes, portes-fenêtres, fenêtres et baies coulissantes en indiquant le côté, la position depuis le début du côté, la largeur, la hauteur, l'allège et le sens d'ouverture.
4. Agencement : en mode automatique, les pièces sont placées et accolées (pièces de jour en bas, dégagement au centre, chambres et pièces d'eau en haut). Glissez une pièce sur le plan pour passer en mode manuel, avec aimantation sur grille de 5 cm et sur les murs voisins. Les flèches du clavier déplacent la pièce sélectionnée.
5. Onglets « Plan 2D », « Vue 3D » et « Vue partagée ». Dans la 3D : glissez pour tourner, molette ou pincement pour zoomer, boutons de vues (dessus, façades), « Maquette ouverte », « Plafonds », « Rotation auto », « Visite ».
6. Panneau « Surfaces » à droite (barre repliable sur tablette) : cliquez sur une pièce pour la sélectionner en 2D et en 3D. Les types exclus de la surface habitable sont paramétrables par cases à cocher.
7. Menu « Exporter » : SVG, PNG, PDF, capture 3D, JSON. Le menu « Projets » permet de lister, renommer, dupliquer, supprimer, importer et exporter les projets.
8. Bouton « ? » : aide, raccourcis clavier et relance du guide.

## Conventions de mesure

- Toutes les mesures sont en mètres, avec deux décimales et virgule décimale.
- Les dimensions saisies sont les dimensions intérieures des pièces. Les murs sont tracés à l'extérieur : 0,20 m pour les murs extérieurs, 0,10 m pour les cloisons entre pièces accolées (valeurs modifiables).
- Les surfaces sont les surfaces intérieures nettes, calculées par la formule du lacet.
- Surface habitable : toutes les pièces sauf les types exclus (garage et cellier par défaut) et les pièces de hauteur inférieure à 1,80 m.

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Vérification TypeScript puis build de production dans `dist` |
| `npm run preview` | Aperçu du build de production |
| `npm run test` | Tests unitaires (Vitest) de la géométrie et des surfaces |
| `npm run test:e2e` | Parcours utilisateur complet (Playwright) |
| `npm run lint` | Analyse statique (oxlint) |
| `npm run icons` | Régénère les icônes PWA |

Pour les tests Playwright, installez une fois le navigateur avec `npx playwright install chromium`. Si un Chromium est déjà présent, indiquez son chemin via la variable `PW_CHROMIUM_PATH`.

## Architecture du code

- `src/model` : types, schémas Zod, valeurs par défaut, formatage français, projet d'exemple.
- `src/geometry` : polygones (construction par côtés, fermeture, aire, point intérieur), murs et mitoyenneté, ouvertures, placement automatique, aimantation, validation, chaînes de cotes. Fonctions pures testées.
- `src/surfaces` : calcul des surfaces et panneau.
- `src/plan2d` : feuille de plan SVG (couches, cartouche, mise en page à l'échelle) et vue interactive.
- `src/viewer3d` : scène Three.js (@react-three/fiber, drei), découpe des murs, textures procédurales, capture.
- `src/export` : SVG, PNG, PDF, JSON.
- `src/store` : état global Zustand persisté en localStorage avec historique annuler/rétablir.
- `src/ui` : formulaires, panneaux, dialogues, guide, aide, ErrorBoundary.
- `e2e` : test Playwright.

## Limites connues

- Un seul niveau par projet (pas d'étages ni d'escaliers).
- Le placement automatique utilise les emprises rectangulaires des pièces : les formes en L ou en U laissent des espaces non occupés que l'on peut combler en mode manuel.
- Les murs mitoyens sont détectés entre côtés parallèles distants au plus de l'épaisseur du mur extérieur plus 10 cm ; au-delà, chaque pièce reçoit un mur extérieur.
- Les ouvertures sont rectangulaires ; pas de cintres ni de fenêtres de toit.
- Le rendu 3D est une maquette simplifiée (pas de mobilier, pas de toiture).
- Les projets sont enregistrés dans le navigateur de l'appareil ; utilisez l'export JSON pour les transférer sur un autre appareil.
