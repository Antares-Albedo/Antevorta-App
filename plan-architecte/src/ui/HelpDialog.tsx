import { useStore } from '../store/useStore'
import { Modal } from './Modal'

const RACCOURCIS: [string, string][] = [
  ['Ctrl + Z', 'Annuler la dernière modification'],
  ['Ctrl + Y ou Ctrl + Maj + Z', 'Rétablir'],
  ['Suppr', 'Supprimer la pièce sélectionnée'],
  ['Échap', 'Désélectionner la pièce / fermer une fenêtre'],
  ['Flèches', 'Déplacer la pièce sélectionnée de 5 cm (mode manuel)'],
  ['Maj + Flèches', 'Déplacer la pièce sélectionnée de 50 cm'],
  ['Molette / pincement', 'Zoomer sur le plan 2D ou la vue 3D'],
  ['Glisser sur le fond', 'Déplacer le plan (panoramique) ou faire tourner la maquette 3D'],
  ['Glisser une pièce', 'Déplacer la pièce sur le plan 2D avec aimantation'],
  ['En mode visite : flèches, Z Q S D', 'Avancer, reculer, tourner, se décaler ; glisser pour regarder autour'],
]

export function HelpDialog() {
  const setUI = useStore((s) => s.setUI)
  return (
    <Modal title="Aide" onClose={() => setUI({ aideOuverte: false })} width="max-w-2xl" testId="aide">
      <h3 className="text-sm font-semibold text-slate-900">Principe</h3>
      <p className="mt-1 text-sm text-slate-700">Toutes les mesures sont des mesures intérieures (de mur à mur), en mètres avec deux décimales. Les murs sont tracés à l'extérieur de ces mesures : murs extérieurs de 0,20 m par défaut, cloisons de 0,10 m entre deux pièces accolées. Les surfaces affichées sont donc les surfaces intérieures nettes, calculées par la formule du lacet.</p>
      <h3 className="mt-3 text-sm font-semibold text-slate-900">Pièces polygonales</h3>
      <p className="mt-1 text-sm text-slate-700">Décrivez la pièce côté par côté : la longueur du côté et l'angle intérieur avec le côté suivant (90° pour un angle droit, 270° pour un angle rentrant, 135° pour un pan coupé à 45°). La somme des angles doit valoir (n - 2) × 180°. Si l'écart de fermeture est inférieur à 5 cm, un bouton ajuste automatiquement le dernier côté.</p>
      <h3 className="mt-3 text-sm font-semibold text-slate-900">Raccourcis clavier</h3>
      <table className="mt-1 w-full text-sm">
        <tbody>
          {RACCOURCIS.map(([k, d]) => (
            <tr key={k} className="border-t border-slate-100">
              <td className="py-1 pr-3 font-mono text-xs text-slate-800">{k}</td>
              <td className="py-1 text-slate-700">{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="mt-3 text-sm font-semibold text-slate-900">Installation et hors ligne</h3>
      <p className="mt-1 text-sm text-slate-700">Dans Chrome ou Edge, utilisez « Installer l'application » dans la barre d'adresse pour l'ajouter à votre ordinateur ou votre tablette. Une fois installée, elle fonctionne sans connexion.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn" onClick={() => setUI({ aideOuverte: false, guideOuvert: true })}>
          Relancer le guide
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setUI({ aideOuverte: false })}>
          Fermer
        </button>
      </div>
    </Modal>
  )
}
