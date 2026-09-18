#!/bin/bash
# Lancement en double-clic sous macOS (Plan Architecte 2D/3D)
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js n'est pas installé. Téléchargez-le sur https://nodejs.org (version LTS) puis relancez ce fichier."
  read -r -p "Appuyez sur Entrée pour fermer."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installation des dépendances, patientez quelques minutes..."
  npm install || { echo "L'installation a échoué. Vérifiez votre connexion internet."; read -r -p "Appuyez sur Entrée pour fermer."; exit 1; }
fi

echo "Lancement de l'application sur http://localhost:5173"
(sleep 3 && open "http://localhost:5173") &
npm run dev -- --host --port 5173
