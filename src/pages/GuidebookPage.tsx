import { GuidebookBoard } from '../components/guidebook/GuidebookBoard'
import { GuidebookProvider } from '../components/guidebook/GuidebookContext'
import { GuidebookOfficialLinks } from '../components/guidebook/GuidebookOfficialLinks'
import { PageHeader } from '../components/PageHeader'

function GuidebookContent() {
  return (
    <div className="guidebook-page guidebook-page--board guidebook-scroll--themed">
      <PageHeader
        title="Guidebook"
        lead="Follow the Digimon Odyssey progression guide and jump to official guide pages when you need them."
      />

      <GuidebookBoard />

      <div className="guidebook-official-row">
        <GuidebookOfficialLinks />
      </div>
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
