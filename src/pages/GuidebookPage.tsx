import { GuidebookBoard } from '../components/guidebook/GuidebookBoard'
import { GuidebookProvider } from '../components/guidebook/GuidebookContext'
import { GuidebookOfficialLinks } from '../components/guidebook/GuidebookOfficialLinks'

function GuidebookContent() {
  return (
    <div className="guidebook-page guidebook-page--board guidebook-scroll--themed">
      <header className="guidebook-hero">
        <h1 className="guidebook-hero__title">Guidebook</h1>
      </header>

      <GuidebookOfficialLinks />
      <GuidebookBoard />
    </div>
  )
}

export function GuidebookPage() {
  return (
    <GuidebookProvider>
      <GuidebookContent />
    </GuidebookProvider>
  )
}
