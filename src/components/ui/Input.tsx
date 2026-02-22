import { cn } from '@/utils/cn';
import type { InputHTMLAttributes } from 'react';
import { Icon } from './Icon';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: string;
}

export function Input({ label, error, icon, className, ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-surface-700 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400">
            <Icon name={icon} size={20} />
          </div>
        )}
        <input
          className={cn(
            'w-full px-4 py-3 rounded-xl border border-surface-200 bg-white',
            'text-surface-800 placeholder:text-surface-400',
            'focus:border-primary-500 focus:ring-2 focus:ring-primary-100',
            'transition-all duration-200',
            icon && 'pr-11',
            error && 'border-danger-500 focus:border-danger-500 focus:ring-danger-100',
            className
          )}
          {...props}
        />
      </div>
      {error && (
        <p className="mt-1 text-sm text-danger-500 flex items-center gap-1">
          <Icon name="error" size={16} />
          {error}
        </p>
      )}
    </div>
  );
}
