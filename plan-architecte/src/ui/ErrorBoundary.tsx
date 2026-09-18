import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useStore } from '../store/useStore'

interface Props {
  children: ReactNode
  /** Zone concernée, pour un message explicite. */
  zone?: string
}

interface State {
  error: Error | null
}

/** Évite tout écran blanc : affiche un message et permet de revenir au dernier état valide. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Erreur de rendu', error, info.componentStack)
  }

  private retablir = () => {
    const s = useStore.getState()
    if (s.peutAnnuler()) s.annuler()
    this.setState({ error: null })
  }

  private reinitialiser = () => {
    const s = useStore.getState()
    s.fermerProjet()
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
        <h2 className="text-base font-semibold text-slate-900">Une erreur est survenue{this.props.zone ? ` dans ${this.props.zone}` : ''}</h2>
        <p className="max-w-md text-sm text-slate-600">Vos données sont sauvegardées. Vous pouvez revenir au dernier état valide ou fermer le projet en cours.</p>
        <pre className="max-w-full overflow-auto rounded bg-slate-100 p-2 text-left text-xs text-slate-600">{this.state.error.message}</pre>
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary" onClick={this.retablir}>
            Revenir au dernier état valide
          </button>
          <button type="button" className="btn" onClick={this.reinitialiser}>
            Fermer le projet
          </button>
        </div>
      </div>
    )
  }
}
