import type { ReactNode } from 'react'
import { GuidebookProvider } from '../components/guidebook/GuidebookContext'
import { GuidebookToc } from '../components/guidebook/GuidebookToc'
import { GuideCard, GuideProse } from '../components/guidebook/GuidebookUi'
import {
  GuidebookComingSoon,
  GuideEarlyGame150,
  GuideEarlyGame5070,
  GuideEarlyGame70Beyond,
  GuideGearDigivice,
  GuideGearGoggles,
  GuideGearKeyring,
  GuideGearNecklace,
  GuideGearRing,
  GuideMidGameFarmingDigimon,
} from '../components/guidebook/GuidebookWidgets'
import { OFFICIAL_BEGINNERS_GUIDE_URL } from '../lib/guidebookContent'

function GuideChapter({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="guidebook-chapter" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="guidebook-chapter__title">
        {title}
      </h2>
      <div className="guidebook-chapter__stack">{children}</div>
    </section>
  )
}

function GuidebookContent() {
  return (
    <div className="guidebook-page guidebook-scroll--themed">
      <header className="guidebook-hero">
        <h1 className="guidebook-hero__title">Guidebook</h1>
      </header>

      <div className="guidebook-layout">
        <GuidebookToc />

        <article className="guidebook-main guidebook-scroll--themed">
          <GuideChapter id="beginners" title="Beginners Guide">
            <GuideCard id="beginners-preface" label="Preface">
              <GuideProse>
                <p>
                  This guide is meant to assist players through the mid-end game stages. This was made
                  with the intention to be valid even with new updates, but may become outdated in the
                  future.
                </p>
              </GuideProse>
            </GuideCard>
            <GuideCard id="beginners-official" label="Official Guide">
              <GuideProse>
                <p>
                  An official guide going over the basics of the game is available{' '}
                  <a href={OFFICIAL_BEGINNERS_GUIDE_URL} target="_blank" rel="noreferrer">
                    here
                  </a>
                  . Please review this guide as we will try not to go over the same steps again.
                </p>
              </GuideProse>
            </GuideCard>
          </GuideChapter>

          <GuideChapter id="early-game" title="Early Game">
            <GuideCard id="early-1-50" label="1-50">
              <GuideEarlyGame150 />
            </GuideCard>
            <GuideCard id="early-50-70" label="50-70">
              <GuideEarlyGame5070 />
            </GuideCard>
            <GuideCard id="early-70-beyond" label="70 and beyond">
              <GuideEarlyGame70Beyond />
            </GuideCard>
          </GuideChapter>

          <GuideChapter id="mid-game" title="Mid Game">
            <GuideCard id="mid-farming-digimon" label="Farming a digimon">
              <GuideMidGameFarmingDigimon />
            </GuideCard>
            <GuideCard id="mid-cloning" label="Cloning">
              <GuidebookComingSoon />
            </GuideCard>
            <GuideCard id="mid-seals" label="Seals">
              <GuidebookComingSoon />
            </GuideCard>
            <GuideCard id="mid-digivice" label="Digivice">
              <GuideGearDigivice />
            </GuideCard>
            <GuideCard id="mid-clothes" label="Clothes">
              <GuidebookComingSoon />
            </GuideCard>
            <GuideCard id="mid-ring" label="Ring">
              <GuideGearRing />
            </GuideCard>
            <GuideCard id="mid-necklace" label="Necklace">
              <GuideGearNecklace />
            </GuideCard>
            <GuideCard id="mid-goggles" label="Goggles">
              <GuideGearGoggles />
            </GuideCard>
            <GuideCard id="mid-keyring" label="Keyring">
              <GuideGearKeyring />
            </GuideCard>
          </GuideChapter>
        </article>
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
