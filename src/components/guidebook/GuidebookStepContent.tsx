import {
  GuidebookComingSoon,
  GuidebookClones,
  GuideEarlyGame150,
  GuideEarlyGame5070,
  GuideEarlyGame70Beyond,
  GuideGearCorruptedAccessories,
  GuideGearChips,
  GuideGearClothes,
  GuideGearCorruptedChips,
  GuideGearDigiAura,
  GuideGearOlympusClothes,
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
    case 'mid-chips':
      return <GuideGearChips />
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
    case 'mid-corrupted-chips':
      return <GuideGearCorruptedChips />
    case 'mid-digi-aura':
      return <GuideGearDigiAura />
    case 'mid-corrupted-accessories':
      return <GuideGearCorruptedAccessories />
    default:
      return <GuidebookComingSoon />
  }
}
