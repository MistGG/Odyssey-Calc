import {
  COMMUNITY_GUIDE_SOCIAL_PLATFORMS,
  type CommunityGuideSocialLink,
  type CommunityGuideSocialPlatform,
} from '../../lib/communityGuideSocials'

export type CommunityGuideSocialDraft = {
  key: string
  platform: CommunityGuideSocialPlatform
  url: string
}

type CommunityGuideSocialLinksEditorProps = {
  links: CommunityGuideSocialDraft[]
  onChange: (links: CommunityGuideSocialDraft[]) => void
}

let socialDraftKey = 0

export function createEmptySocialDraft(
  platform: CommunityGuideSocialPlatform = 'youtube',
): CommunityGuideSocialDraft {
  socialDraftKey += 1
  return { key: `social-${socialDraftKey}`, platform, url: '' }
}

export function socialDraftsFromLinks(links: CommunityGuideSocialLink[]): CommunityGuideSocialDraft[] {
  return links.map((link) => {
    socialDraftKey += 1
    return { key: `social-${socialDraftKey}`, platform: link.platform, url: link.url }
  })
}

export function CommunityGuideSocialLinksEditor({
  links,
  onChange,
}: CommunityGuideSocialLinksEditorProps) {
  return (
    <fieldset className="community-guide-socials-editor">
      <legend className="community-guides-field__label">Social links (optional)</legend>
      <p className="community-guides-field__hint">
        Add YouTube, Twitch, or other links shown on your guide page. URLs must be https and match
        the selected platform.
      </p>
      {links.length > 0 ? (
        <ul className="community-guide-socials-editor__list">
          {links.map((link) => (
            <li key={link.key} className="community-guide-socials-editor__row">
              <label className="community-guide-socials-editor__platform">
                <span className="visually-hidden">Platform</span>
                <select
                  className="community-guide-socials-editor__select"
                  value={link.platform}
                  onChange={(e) =>
                    onChange(
                      links.map((row) =>
                        row.key === link.key
                          ? { ...row, platform: e.target.value as CommunityGuideSocialPlatform }
                          : row,
                      ),
                    )
                  }
                >
                  {COMMUNITY_GUIDE_SOCIAL_PLATFORMS.map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.label}
                    </option>
                  ))}
                </select>
              </label>
              <input
                type="url"
                className="community-guide-socials-editor__input"
                value={link.url}
                onChange={(e) =>
                  onChange(
                    links.map((row) =>
                      row.key === link.key ? { ...row, url: e.target.value } : row,
                    ),
                  )
                }
                placeholder="https://"
              />
              <button
                type="button"
                className="community-guides-btn community-guides-btn--ghost community-guide-socials-editor__remove"
                onClick={() => onChange(links.filter((row) => row.key !== link.key))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {links.length < 8 ? (
        <button
          type="button"
          className="community-guides-btn community-guides-btn--ghost"
          onClick={() => onChange([...links, createEmptySocialDraft()])}
        >
          + Add social link
        </button>
      ) : null}
    </fieldset>
  )
}
