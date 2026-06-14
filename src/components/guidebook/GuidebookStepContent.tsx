import {
  GuidebookComingSoon,
  GuidebookClones,
  GuideEarlyGame150,
  GuideEarlyGame5070,
  GuideEarlyGame70Beyond,
  GuideGearCorruptedEarring,
  GuideGearCorruptedNecklace,
  GuideGearClothes,
  GuideGearOlympusClothes,
  GuideGearCorruptedRing,
  GuideGearDigivice,
  GuideGearEarring,
  GuideGearGoggles,
  GuideGearKeyring,
  GuideGearNecklace,
  GuideGearRing,
  GuidebookRaids,
  GuidebookSeals,
} from './GuidebookWidgets'

export function GuidebookStepContent({ stepId }: { stepId: string }) {
  switch (stepId) {
    case 'starter':
      return <GuideEarlyGame150 />
    case 'early-50-70':
      return <GuideEarlyGame5070 />
    case 'early-70-beyond':
      return <GuideEarlyGame70Beyond />
    case 'mid-raids':
      return <GuidebookRaids />
    case 'mid-seals':
      return <GuidebookSeals />
    case 'mid-clones':
      return <GuidebookClones />
    case 'mid-clothes':
      return <GuideGearClothes />
    case 'mid-digivice':
      return <GuideGearDigivice />
    case 'mid-ring':
      return <GuideGearRing />
    case 'mid-necklace':
      return <GuideGearNecklace />
    case 'mid-goggles':
      return <GuideGearGoggles />
    case 'mid-keyring':
      return <GuideGearKeyring />
    case 'mid-earring':
      return <GuideGearEarring />
    case 'mid-corrupted-clothes':
      return <GuideGearOlympusClothes />
    case 'mid-corrupted-ring':
      return <GuideGearCorruptedRing />
    case 'mid-corrupted-necklace':
      return <GuideGearCorruptedNecklace />
    case 'mid-corrupted-earring':
      return <GuideGearCorruptedEarring />
    default:
      return <GuidebookComingSoon />
  }
}
