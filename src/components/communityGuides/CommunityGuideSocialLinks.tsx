import {
  communityGuideSocialLabel,
  type CommunityGuideSocialLink,
} from '../../lib/communityGuideSocials'

export function CommunityGuideSocialLinks({ links }: { links: CommunityGuideSocialLink[] }) {
  if (!links.length) return null

  return (
    <div className="community-guide-socials" aria-label="Author social links">
      {links.map((link) => (
        <a
          key={`${link.platform}-${link.url}`}
          href={link.url}
          target="_blank"
          rel="noreferrer noopener"
          className={`community-guide-socials__link community-guide-socials__link--${link.platform}`}
        >
          {communityGuideSocialLabel(link.platform)}
        </a>
      ))}
    </div>
  )
}
