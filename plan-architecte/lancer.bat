@echo off
chcp 65001 >nul
title Plan Architecte 2D/3D
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe. Telechargez-le sur https://nodejs.org ^(version LTS^) puis relancez ce fichier.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installation des dependances, patientez quelques minutes...
  call npm install
  if errorlevel 1 (
    echo L'installation a echoue. Verifiez votre connexion internet.
    pause
    exit /b 1
  )
)

echo Lancement de l'application sur http://localhost:5173
start "" "http://localhost:5173"
call npm run dev -- --host --port 5173
pause
