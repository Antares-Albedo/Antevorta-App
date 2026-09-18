import { useRef } from 'react'
import { useStore } from '../store/useStore'
import { parseProjectFile, readFileAsText } from '../export/exporters'
import { useToast } from './Toast'
import { formatDate } from '../model/format'

export function Welcome() {
  const projets = useStore((s) => s.projets)
  const creerProjet = useStore((s) => s.creerProjet)
  const ouvrirProjet = useStore((s) => s.ouvrirProjet)
  const chargerExemple = useStore((s) => s.chargerExemple)
  const importerProjets = useStore((s) => s.importerProjets)
  const setUI = useStore((s) => s.setUI)
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast((s) => s.push)
  const liste = Object.values(projets).sort((a, b) => b.modifieLe.localeCompare(a.modifieLe))

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const projets = parseProjectFile(await readFileAsText(file))
      importerProjets(projets)
      toast(`${projets.length} projet${projets.length > 1 ? 's' : ''} importé${projets.length > 1 ? 's' : ''}`)
    } catch (e) {
      toast((e as Error).message, 'erreur')
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-6" data-testid="accueil">
      <div className="w-full max-w-3xl rounded-xl bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-slate-900">Plan Architecte 2D/3D</h1>
        <p className="mt-1 text-sm text-slate-600">Saisissez les mesures de vos pièces : le plan 2D coté, la maquette 3D et le tableau des surfaces sont générés automatiquement.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <button type="button" className="flex flex-col items-start gap-1 rounded-lg border-2 border-blue-600 bg-blue-50 p-4 text-left hover:bg-blue-100" onClick={() => creerProjet()} data-testid="accueil-nouveau">
            <span className="text-lg font-semibold text-blue-900">Nouveau projet</span>
            <span className="text-xs text-blue-800">Partez d'une page blanche et ajoutez vos pièces.</span>
          </button>
          <button type="button" className="flex flex-col items-start gap-1 rounded-lg border-2 border-slate-300 p-4 text-left hover:bg-slate-50" onClick={() => (liste.length > 0 ? setUI({ projetsOuvert: true }) : fileRef.current?.click())} data-testid="accueil-ouvrir">
            <span className="text-lg font-semibold text-slate-900">Ouvrir un projet</span>
            <span className="text-xs text-slate-600">{liste.length > 0 ? `${liste.length} projet${liste.length > 1 ? 's' : ''} enregistré${liste.length > 1 ? 's' : ''} sur cet appareil, ou un fichier JSON.` : 'Importez un fichier JSON exporté précédemment.'}</span>
          </button>
          <button type="button" className="flex flex-col items-start gap-1 rounded-lg border-2 border-slate-300 p-4 text-left hover:bg-slate-50" onClick={() => chargerExemple()} data-testid="accueil-exemple">
            <span className="text-lg font-semibold text-slate-900">Charger l'exemple</span>
            <span className="text-xs text-slate-600">Un T3 de démonstration avec séjour en L et cuisine à pan coupé.</span>
          </button>
        </div>
        {liste.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-slate-700">Projets récents</h2>
            <ul className="mt-2 divide-y divide-slate-100 rounded border border-slate-200">
              {liste.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => ouvrirProjet(p.id)}>
                    <span className="font-medium text-slate-800">{p.nom}</span>
                    <span className="text-xs text-slate-500">
                      {p.pieces.length} pièce{p.pieces.length > 1 ? 's' : ''} · modifié le {formatDate(new Date(p.modifieLe))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Importer un fichier de projet" />
        <p className="mt-6 text-xs text-slate-500">Vos projets sont enregistrés automatiquement dans ce navigateur. Exportez-les en JSON pour les partager ou les archiver.</p>
      </div>
    </main>
  )
}
