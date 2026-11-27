import { useState } from 'react';

export const PRESET_AVATAR_URLS = [
  './avatars/reza.webp',
  './avatars/nabila.webp',
  './avatars/dimas.webp',
  './avatars/fajar.webp',
  './avatars/tara.webp',
  './avatars/guest.webp',
] as const;

export const AVATAR_VARIANT_COUNT = PRESET_AVATAR_URLS.length;

interface AvatarProps {
  initials: string;
  color: string;
  avatarUrl?: string;
  variant?: number;
  seed?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'story' | 'xl';
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

export function resolveAvatarImageUrl(
  avatarUrl?: string,
  variant?: number,
  seed?: string
): string {
  if (avatarUrl) return avatarUrl;
  return PRESET_AVATAR_URLS[resolveAvatarVariant(variant, seed)];
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
  const [imgError, setImgError] = useState(false);
  const src = resolveAvatarImageUrl(avatarUrl, variant, seed ?? initials);

  return (
    <span
      className={`avatar ${size}`}
      style={{
        background: imgError ? color : 'var(--bg-input)',
        boxShadow: speaking
          ? '0 0 0 2px var(--bg-sidebar), 0 0 0 4px var(--accent)'
          : undefined,
      }}
    >
      {!imgError ? (
        <img
          src={src}
          alt={alt || initials}
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <span>{initials}</span>
      )}
      {showPresence && (
        <span
          className={`avatar-dot ${online ? '' : 'offline'} ${speaking ? 'speaking' : ''}`}
        />
      )}
    </span>
  );
}
