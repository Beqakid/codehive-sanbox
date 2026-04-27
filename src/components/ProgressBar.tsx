import React from 'react';

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
  animate?: boolean;
}

const sizeClasses: Record<NonNullable<ProgressBarProps['size']>, string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

const variantClasses: Record<NonNullable<ProgressBarProps['variant']>, string> = {
  default: 'bg-blue-600',
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  danger: 'bg-red-500',
};

function resolveVariantFromValue(value: number): NonNullable<ProgressBarProps['variant']> {
  if (value >= 100) return 'success';
  if (value >= 60) return 'default';
  if (value >= 30) return 'warning';
  return 'danger';
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  label,
  showPercentage = false,
  size = 'md',
  variant,
  className = '',
  animate = true,
}) => {
  const clampedValue = Math.min(Math.max(value, 0), max);
  const percentage = max > 0 ? Math.round((clampedValue / max) * 100) : 0;

  const resolvedVariant = variant ?? resolveVariantFromValue(percentage);
  const fillClass = variantClasses[resolvedVariant];
  const barHeightClass = sizeClasses[size];

  return (
    <div className={`w-full ${className}`} role="region" aria-label={label ?? 'Progress'}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between mb-1">
          {label && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {label}
            </span>
          )}
          {showPercentage && (
            <span className="text-sm font-semibold text-gray-600 dark:text-gray-400 ml-auto">
              {percentage}%
            </span>
          )}
        </div>
      )}

      <div
        className={`w-full ${barHeightClass} bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden`}
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className={`
            ${barHeightClass}
            ${fillClass}
            rounded-full
            ${animate ? 'transition-all duration-500 ease-in-out' : ''}
          `}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;