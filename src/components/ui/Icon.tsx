import { cn } from '@/utils/cn';

interface IconProps {
  name: string;
  filled?: boolean;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({ name, filled = false, size = 24, className, style }: IconProps) {
  return (
    <span
      className={cn(
        'material-symbols-rounded select-none',
        filled && 'filled',
        className
      )}
      style={{ fontSize: size, ...style }}
    >
      {name}
    </span>
  );
}
