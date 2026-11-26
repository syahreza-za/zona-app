interface AvatarProps {
  initials: string;
  color: string;
  avatarUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  online?: boolean;
  showPresence?: boolean;
  speaking?: boolean;
  alt?: string;
}

export function Avatar({
  initials,
  color,
  avatarUrl,
  size = 'md',
  online = false,
  showPresence = false,
  speaking = false,
  alt = '',
}: AvatarProps) {
  return (
    <span
      className={`avatar ${size}`}
      style={{
        background: avatarUrl ? 'transparent' : color,
        boxShadow: speaking
          ? '0 0 0 2px var(--bg-sidebar), 0 0 0 4px var(--accent)'
          : undefined,
      }}
    >
      {avatarUrl ? <img src={avatarUrl} alt={alt || initials} /> : initials}
      {showPresence && (
        <span
          className={`avatar-dot ${online ? '' : 'offline'} ${speaking ? 'speaking' : ''}`}
        />
      )}
    </span>
  );
}
