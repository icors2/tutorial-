import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  createTutorial,
  deleteTutorial,
  listTutorials,
  type TutorialRecord,
} from '../db/schema'
import { importTutorialPackage } from '../services/tutorialPackage'

export function Dashboard() {
  const [tutorials, setTutorials] = useState<TutorialRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [importBusy, setImportBusy] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listTutorials()
      setTutorials(list)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, location.pathname, location.key])

  async function handleCreate() {
    const id = await createTutorial('Untitled tutorial')
    void navigate(`/edit/${id}`)
  }

  async function handleImportPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportBusy(true)
    try {
      const { tutorialId, title: importedTitle } = await importTutorialPackage(file)
      await load()
      window.alert(`Imported “${importedTitle}”. Opening editor…`)
      void navigate(`/edit/${tutorialId}`)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImportBusy(false)
    }
  }

  async function handleDelete(e: MouseEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm('Delete this tutorial and all its steps?')) return
    await deleteTutorial(id)
    await load()
  }

  function formatDate(ts: number) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(ts))
    } catch {
      return new Date(ts).toLocaleString()
    }
  }

  return (
    <div className="page dashboard">
      <header className="page-header">
        <h1 className="page-header__title">TutoDOC</h1>
        <p className="page-header__subtitle">Tutorial drafts</p>
        <div className="dashboard__import-row">
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            onChange={(ev) => void handleImportPick(ev)}
          />
          <button
            type="button"
            className="btn btn--secondary dashboard__import-btn"
            disabled={importBusy || loading}
            onClick={() => importInputRef.current?.click()}
          >
            {importBusy ? 'Importing…' : 'Import transfer file'}
          </button>
          <span className="muted dashboard__import-hint">
            From phone: open the tutorial → Transfer → Download or Share, then pick that{' '}
            <code className="dashboard__code">.tutodoc.json</code> here.
          </span>
        </div>
      </header>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : tutorials.length === 0 ? (
        <p className="muted">No tutorials yet. Tap + to create one.</p>
      ) : (
        <ul className="tutorial-list">
          {tutorials.map((t) => (
            <li key={t.id} className="tutorial-list__item">
              <Link to={`/edit/${t.id}`} className="tutorial-list__link">
                <span className="tutorial-list__name">{t.title}</span>
                <span className="tutorial-list__meta">{formatDate(t.updatedAt)}</span>
              </Link>
              <button
                type="button"
                className="tutorial-list__delete"
                aria-label="Delete tutorial"
                onClick={(e) => void handleDelete(e, t.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="fab"
        aria-label="Create new tutorial"
        onClick={() => void handleCreate()}
      >
        +
      </button>
    </div>
  )
}
