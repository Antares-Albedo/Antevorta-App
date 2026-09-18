import { useState } from 'react'
import { useStore } from '../store/useStore'
import { Modal } from './Modal'

const STEPS = [
  {
    titre: '1. Ajoutez vos pièces',
    texte: "Dans le panneau de gauche, choisissez un type de pièce (séjour, chambre, cuisine…) puis cliquez sur « Ajouter ». Des dimensions réalistes sont proposées. Cliquez sur une pièce de la liste pour ouvrir son formulaire.",
  },
  {
    titre: '2. Renseignez les mesures et les ouvertures',
    texte: "Saisissez la longueur et la largeur mesurées de mur à mur. Pour une pièce en L, en T ou avec un pan coupé, passez en mode « Polygone » et décrivez chaque côté (longueur et angle). Ajoutez ensuite les portes et fenêtres sur le côté concerné.",
  },
  {
    titre: '3. Consultez le plan 2D, la 3D et les surfaces',
    texte: "Les onglets « Plan 2D », « Vue 3D » et « Vue partagée » se mettent à jour instantanément. Le panneau de droite affiche les surfaces de chaque pièce et du bien. Glissez une pièce sur le plan pour la déplacer (mode manuel), faites tourner la maquette 3D à la souris ou au doigt.",
  },
  {
    titre: '4. Exportez et partagez',
    texte: "Le menu « Exporter » produit le plan en SVG, PNG ou PDF (A4 ou A3, échelle 1/50 ou 1/100), une capture de la vue 3D et le fichier JSON du projet. Tout est sauvegardé automatiquement dans le navigateur ; l'application fonctionne hors ligne une fois installée.",
  },
]

export function Guide() {
  const setUI = useStore((s) => s.setUI)
  const guideDesactive = useStore((s) => s.ui.guideDesactive)
  const [step, setStep] = useState(0)
  const close = () => setUI({ guideOuvert: false })
  const s = STEPS[step]
  return (
    <Modal title="Prise en main en 4 étapes" onClose={close} testId="guide">
      <div className="flex gap-1" aria-hidden>
        {STEPS.map((_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded ${i <= step ? 'bg-blue-600' : 'bg-slate-200'}`} />
        ))}
      </div>
      <h3 className="mt-3 text-sm font-semibold text-slate-900">{s.titre}</h3>
      <p className="mt-1 text-sm text-slate-700">{s.texte}</p>
      <div className="mt-4 flex items-center justify-between">
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={guideDesactive} onChange={(e) => setUI({ guideDesactive: e.target.checked })} />
          Ne plus afficher au démarrage
        </label>
        <div className="flex gap-1">
          <button type="button" className="btn btn-sm" onClick={() => setStep((x) => Math.max(0, x - 1))} disabled={step === 0}>
            Précédent
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setStep((x) => x + 1)} data-testid="guide-suivant">
              Suivant
            </button>
          ) : (
            <button type="button" className="btn btn-sm btn-primary" onClick={close} data-testid="guide-terminer">
              Terminer
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
