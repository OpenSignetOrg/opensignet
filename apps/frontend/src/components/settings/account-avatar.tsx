/* eslint-disable @next/next/no-img-element -- Avatars come from our own storage at fixed sizes. */
import { cn } from '@/lib/utils';

/** The account picture, or initials on a neutral tile when there is none. */
export function AccountAvatar({
  url,
  name,
  email,
  size = 64,
  className,
}: {
  url: string | null;
  name: string | null;
  email: string | null;
  size?: number;
  className?: string;
}) {
  const label = name?.trim() || email?.split('@')[0] || '';
  const initials =
    label
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => [...part][0]?.toUpperCase() ?? '')
      .join('') || '•';
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/80 bg-secondary font-semibold text-foreground/80',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {url ? (
        <img src={url} alt="" width={size} height={size} className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}
