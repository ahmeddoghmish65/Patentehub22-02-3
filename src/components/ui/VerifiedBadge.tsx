import { cn } from '@/utils/cn';

interface VerifiedBadgeProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  tooltip?: boolean;
}

/**
 * Modern verified badge — Patente Hub
 * Inspired by 2024-era social platform checkmarks:
 * circular gradient with animated shine ring + crisp white checkmark.
 */
export function VerifiedBadge({ size = 'sm', className, tooltip = false }: VerifiedBadgeProps) {
  const dims: Record<string, number> = { xs: 14, sm: 18, md: 24, lg: 30 };
  const px = dims[size] ?? 18;

  const badge = (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0 inline-block', className)}
      aria-label="حساب موثق"
      role="img"
    >
      <defs>
        {/* Main gradient: electric blue → violet */}
        <linearGradient id="vb_g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="50%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>

        {/* Subtle inner highlight */}
        <radialGradient id="vb_hl" cx="35%" cy="30%" r="55%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>

        {/* Drop shadow filter */}
        <filter id="vb_shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#4f46e5" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Outer glow ring */}
      <circle cx="12" cy="12" r="11" fill="none" stroke="url(#vb_g)" strokeWidth="0.5" opacity="0.35" />

      {/* Main circle */}
      <circle cx="12" cy="12" r="10" fill="url(#vb_g)" filter="url(#vb_shadow)" />

      {/* Highlight overlay */}
      <circle cx="12" cy="12" r="10" fill="url(#vb_hl)" />

      {/* Crisp white checkmark */}
      <path
        d="M7.5 12.5L10.5 15.5L16.5 9"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (!tooltip) return badge;

  return (
    <span className="relative group inline-flex items-center">
      {badge}
      <span className="pointer-events-none absolute bottom-full mb-2 right-1/2 translate-x-1/2 bg-surface-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="#4f46e5" />
          <path d="M7.5 12.5L10.5 15.5L16.5 9" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        حساب موثق
        <span className="absolute top-full right-1/2 translate-x-1/2 -translate-y-px border-4 border-transparent border-t-surface-900" />
      </span>
    </span>
  );
}
