import { useRef, useState } from 'react'
import { formatDate } from '../model/format'
import { useStore } from '../store/useStore'
import { exportJson, parseProjectFile, readFileAsText } from '../export/exporters'
import { Modal } from './Modal'
import { useToast } from './Toast'

export function ProjectsDialog() {
  const projets = useStore((s) => s.projets)
  const projetCourantId = useStore((s) => s.projetCourantId)
  const setUI = useStore((s) => s.setUI)
  const creerProjet = useStore((s) => s.creerProjet)
  const ouvrirProjet = useStore((s) => s.ouvrirProjet)
  const renommerProjet = useStore((s) => s.renommerProjet)
  const dupliquerProjet = useStore((s) => s.dupliquerProjet)
  const supprimerProjet = useStore((s) => s.supprimerProjet)
  const importerProjets = useStore((s) => s.importerProjets)
  const chargerExemple = useStore((s) => s.chargerExemple)
  const toast = useToast((s) => s.push)
  const fileRef = useRef<HTMLInputElement>(null)
  const [renaming, setRenaming] = useState<{ id: string; nom: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const liste = Object.values(projets).sort((a, b) => b.modifieLe.localeCompare(a.modifieLe))
  const close = () => setUI({ projetsOuvert: false })

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const ps = parseProjectFile(await readFileAsText(file))
      importerProjets(ps)
      toast(`${ps.length} projet${ps.length > 1 ? 's' : ''} importé${ps.length > 1 ? 's' : ''}`)
    } catch (e) {
      toast((e as Error).message, 'erreur')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <Modal title="Mes projets" onClose={close} width="max-w-2xl" testId="dialogue-projets">
      <div className="mb-3 flex flex-wrap gap-1">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => creerProjet()}>
          Nouveau projet
        </button>
        <button type="button" className="btn btn-sm" onClick={() => chargerExemple()}>
          Charger l'exemple
        </button>
        <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
          Importer un JSON
        </button>
        {liste.length > 0 && (
          <button type="button" className="btn btn-sm" onClick={() => exportJson(liste, 'plans-architecte-tous-projets.json')}>
            Exporter tous les projets
          </button>
        )}
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Importer un fichier de projet" />
      </div>
      {liste.length === 0 ? (
        <p className="text-sm text-slate-600">Aucun projet enregistré.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded border border-slate-200">
          {liste.map((p) => (
            <li key={p.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${p.id === projetCourantId ? 'bg-blue-50' : ''}`}>
              {renaming?.id === p.id ? (
                <form
                  className="flex flex-1 gap-1"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (renaming.nom.trim()) renommerProjet(p.id, renaming.nom.trim())
                    setRenaming(null)
                  }}
                >
                  <input className="field-input" value={renaming.nom} onChange={(e) => setRenaming({ id: p.id, nom: e.target.value })} aria-label="Nouveau nom" autoFocus />
                  <button type="submit" className="btn btn-sm btn-primary">
                    OK
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setRenaming(null)}>
                    Annuler
                  </button>
                </form>
              ) : (
                <>
                  <button type="button" className="flex-1 text-left" onClick={() => ouvrirProjet(p.id)}>
                    <span className="text-sm font-medium text-slate-900">{p.nom}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      {p.pieces.length} pièce{p.pieces.length > 1 ? 's' : ''} · modifié le {formatDate(new Date(p.modifieLe))}
                    </span>
                  </button>
                  <div className="flex gap-1">
                    <button type="button" className="btn btn-sm" onClick={() => ouvrirProjet(p.id)}>
                      Ouvrir
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => setRenaming({ id: p.id, nom: p.nom })}>
                      Renommer
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => dupliquerProjet(p.id)}>
                      Dupliquer
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => exportJson([p])}>
                      Exporter
                    </button>
                    {confirmDelete === p.id ? (
                      <>
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => { supprimerProjet(p.id); setConfirmDelete(null) }}>
                          Confirmer
                        </button>
                        <button type="button" className="btn btn-sm" onClick={() => setConfirmDelete(null)}>
                          Non
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-sm text-red-700" onClick={() => setConfirmDelete(p.id)}>
                        Supprimer
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
