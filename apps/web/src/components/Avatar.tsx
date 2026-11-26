export const AVATAR_VARIANT_COUNT = 6;

interface AvatarProps {
  initials: string;
  color: string;
  avatarUrl?: string;
  variant?: number;
  seed?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
  showPresence?: boolean;
  speaking?: boolean;
  alt?: string;
}

export function resolveAvatarVariant(variant?: number, seed?: string): number {
  if (typeof variant === 'number' && !Number.isNaN(variant)) {
    return Math.abs(variant) % AVATAR_VARIANT_COUNT;
  }
  const s = seed || 'zona';
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return hash % AVATAR_VARIANT_COUNT;
}

interface CharacterSpec {
  bg: string;
  bgAccent: string;
  skin: string;
  hair: string;
  shirt: string;
  accessory: 'glasses' | 'earrings' | 'headphones' | 'cap' | 'beanie' | 'collar';
  hairStyle: 'short' | 'bob' | 'curly' | 'parted' | 'bun' | 'wave';
}

const CHARACTERS: CharacterSpec[] = [
  // 0: Reza — Friendly glasses + emerald sweater
  {
    bg: '#D1FAE5',
    bgAccent: '#A7F3D0',
    skin: '#F2C19E',
    hair: '#1E293B',
    shirt: '#059669',
    accessory: 'glasses',
    hairStyle: 'parted',
  },
  // 1: Nabila — Warm terracotta sweater + bob hair + small gold earrings
  {
    bg: '#FFEDD5',
    bgAccent: '#FED7AA',
    skin: '#F5CBA7',
    hair: '#291D18',
    shirt: '#EA580C',
    accessory: 'earrings',
    hairStyle: 'bob',
  },
  // 2: Dimas — Sky blue hoodie + studio headphones
  {
    bg: '#E0F2FE',
    bgAccent: '#BAE6FD',
    skin: '#E6B28B',
    hair: '#1F2937',
    shirt: '#0284C7',
    accessory: 'headphones',
    hairStyle: 'short',
  },
  // 3: Fajar — Warm amber jacket + sporty cap
  {
    bg: '#FEF3C7',
    bgAccent: '#FDE68A',
    skin: '#D99E73',
    hair: '#1C1917',
    shirt: '#D97706',
    accessory: 'cap',
    hairStyle: 'curly',
  },
  // 4: Tara — Rose cardigan + high bun
  {
    bg: '#FFE4E6',
    bgAccent: '#FECDD3',
    skin: '#F6D1B6',
    hair: '#2B1B17',
    shirt: '#E11D48',
    accessory: 'collar',
    hairStyle: 'bun',
  },
  // 5: Extra — Teal beanie + cozy jacket
  {
    bg: '#CCFBF1',
    bgAccent: '#99F6E4',
    skin: '#E8B896',
    hair: '#334155',
    shirt: '#0F766E',
    accessory: 'beanie',
    hairStyle: 'wave',
  },
];

/**
 * Generates clean inline SVG markup for illustrated character avatars
 * (shared between React <Avatar /> and MapLibre DOM marker nodes).
 */
export function renderAvatarSvgMarkup(variantIndex: number, customBg?: string): string {
  const c = CHARACTERS[Math.abs(variantIndex) % CHARACTERS.length];
  const bg = customBg ? `${customBg}24` : c.bg;

  const hairBack =
    c.hairStyle === 'bob'
      ? `<path d="M17 31 C16 17 24 12 32 12 C40 12 48 17 47 31 L48 45 C44 46 41 44 40 42 L24 42 C23 44 20 46 16 45 Z" fill="${c.hair}"/>`
      : c.hairStyle === 'bun'
        ? `<circle cx="32" cy="11" r="7" fill="${c.hair}"/><path d="M19 30 C19 18 25 14 32 14 C39 14 45 18 45 30 Z" fill="${c.hair}"/>`
        : '';

  const hairFront =
    c.hairStyle === 'parted'
      ? `<path d="M19 29 C19 17 25 13 33 13 C41 13 45 18 45 29 C42 23 36 22 31 23 C26 24 22 25 19 29 Z" fill="${c.hair}"/>`
      : c.hairStyle === 'bob'
        ? `<path d="M19 27 C21 17 28 14 35 15 C41 16 45 21 45 27 C40 22 34 21 28 22 C24 23 21 24 19 27 Z" fill="${c.hair}"/>`
        : c.hairStyle === 'short'
          ? `<path d="M20 27 C20 17 25 14 32 14 C39 14 44 17 44 27 C41 22 36 20 32 20 C28 20 23 22 20 27 Z" fill="${c.hair}"/>`
          : c.hairStyle === 'curly'
            ? `<circle cx="24" cy="19" r="5" fill="${c.hair}"/><circle cx="32" cy="16" r="5.5" fill="${c.hair}"/><circle cx="40" cy="19" r="5" fill="${c.hair}"/>`
            : c.hairStyle === 'bun'
              ? `<path d="M20 27 C22 18 27 16 32 16 C37 16 42 18 44 27 C40 22 36 21 32 21 C28 21 24 22 20 27 Z" fill="${c.hair}"/>`
              : `<path d="M19 28 C20 17 26 14 32 14 C39 14 44 18 45 28 C40 23 35 21 29 22 C25 23 22 25 19 28 Z" fill="${c.hair}"/>`;

  const accessorySvg =
    c.accessory === 'glasses'
      ? `<rect x="22.5" y="28.5" width="7.5" height="5.5" rx="2.5" fill="none" stroke="#1E293B" stroke-width="1.6"/>
         <rect x="34" y="28.5" width="7.5" height="5.5" rx="2.5" fill="none" stroke="#1E293B" stroke-width="1.6"/>
         <line x1="30" y1="31" x2="34" y2="31" stroke="#1E293B" stroke-width="1.5"/>`
      : c.accessory === 'headphones'
        ? `<path d="M17 31 C17 17 23 11 32 11 C41 11 47 17 47 31" fill="none" stroke="#0F172A" stroke-width="3" stroke-linecap="round"/>
           <rect x="14.5" y="27" width="4.5" height="9" rx="2.2" fill="#0EA5E9"/>
           <rect x="45" y="27" width="4.5" height="9" rx="2.2" fill="#0EA5E9"/>`
        : c.accessory === 'cap'
          ? `<path d="M19 23 C20 14 26 12 32 12 C38 12 44 14 45 23 Z" fill="#0F172A"/>
             <path d="M18 23 Q33 20 49 24 Q42 26 18 23 Z" fill="#334155"/>`
          : c.accessory === 'earrings'
            ? `<circle cx="19.5" cy="36.5" r="1.7" fill="#F59E0B"/><circle cx="44.5" cy="36.5" r="1.7" fill="#F59E0B"/>`
            : c.accessory === 'beanie'
              ? `<path d="M19 25 C20 14 25 11 32 11 C39 11 44 14 45 25 Z" fill="#0F766E"/>
                 <rect x="18" y="22" width="28" height="4.5" rx="2.2" fill="#14B8A6"/>`
              : `<path d="M26 47 L32 52 L38 47" fill="none" stroke="#FFF1F2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
    <rect width="64" height="64" rx="32" fill="${bg}"/>
    <circle cx="52" cy="14" r="14" fill="${c.bgAccent}" opacity="0.55"/>
    ${hairBack}
    <path d="M12 64 C13 51 21 46 32 46 C43 46 51 51 52 64 Z" fill="${c.shirt}"/>
    <rect x="28" y="40" width="8" height="9" rx="4" fill="${c.skin}"/>
    <circle cx="20.5" cy="33" r="3" fill="${c.skin}"/>
    <circle cx="43.5" cy="33" r="3" fill="${c.skin}"/>
    <rect x="21" y="19" width="22" height="24" rx="11" fill="${c.skin}"/>
    <circle cx="27" cy="31" r="1.65" fill="#1E293B"/>
    <circle cx="37" cy="31" r="1.65" fill="#1E293B"/>
    <ellipse cx="24" cy="34.5" rx="2.4" ry="1.3" fill="#F43F5E" opacity="0.22"/>
    <ellipse cx="40" cy="34.5" rx="2.4" ry="1.3" fill="#F43F5E" opacity="0.22"/>
    <path d="M28.5 36.5 Q32 39.5 35.5 36.5" fill="none" stroke="#1E293B" stroke-width="1.65" stroke-linecap="round"/>
    ${hairFront}
    ${accessorySvg}
  </svg>`;
}

export function Avatar({
  initials,
  color,
  avatarUrl,
  variant,
  seed,
  size = 'md',
  online = false,
  showPresence = false,
  speaking = false,
  alt = '',
}: AvatarProps) {
  const resolvedVariant = resolveAvatarVariant(variant, seed ?? initials);
  const svgMarkup = renderAvatarSvgMarkup(resolvedVariant);

  return (
    <span
      className={`avatar ${size}`}
      style={{
        background: avatarUrl ? 'transparent' : `${color}22`,
        boxShadow: speaking
          ? '0 0 0 2px var(--bg-sidebar), 0 0 0 4px var(--accent)'
          : undefined,
      }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={alt || initials} />
      ) : (
        <span
          className="avatar-svg-host"
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      )}
      {showPresence && (
        <span
          className={`avatar-dot ${online ? '' : 'offline'} ${speaking ? 'speaking' : ''}`}
        />
      )}
    </span>
  );
}
