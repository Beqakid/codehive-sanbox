import React from 'react';

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'danger';
  animated?: boolean;
  className?: string;
}

const sizeClasses: Record<NonNullable<ProgressBarProps['size']>, string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

const variantClasses: Record<NonNullable<ProgressBarProps['variant']>, string> = {
  default: 'bg-blue-600',
  success: 'bg-green-500',
  warning: 'bg-yellow-400',
  danger: 'bg-red-500',
};

function getAutoVariant(percentage: number): NonNullable<ProgressBarProps['variant']> {
  if (percentage >= 100) return 'success';
  if (percentage >= 60) return 'default';
  if (percentage >= 30) return 'warning';
  return 'danger';
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  label,
  showPercentage = true,
  size = 'md',
  variant,
  animated = false,
  className = '',
}) => {
  const clampedValue = Math.min(Math.max(0, value), max);
  const percentage = max > 0 ? Math.round((clampedValue / max) * 100) : 0;
  const resolvedVariant = variant ?? getAutoVariant(percentage);
  const fillClass = variantClasses[resolvedVariant];
  const heightClass = sizeClasses[size];

  return (
    <div className={`w-full ${className}`}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {label}
            </span>
          )}
          {showPercentage && (
            <span
              className={`text-sm font-semibold tabular-nums ${
                resolvedVariant === 'success'
                  ? 'text-green-600 dark:text-green-400'
                  : resolvedVariant === 'warning'
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : resolvedVariant === 'danger'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-blue-600 dark:text-blue-400'
              } ${!label ? 'ml-auto' : ''}`}
            >
              {percentage}%
            </span>
          )}
        </div>
      )}

      <div
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label ?? `Progress: ${percentage}%`}
        className={`w-full ${heightClass} bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden`}
      >
        <div
          className={`${heightClass} ${fillClass} rounded-full transition-all duration-500 ease-out ${
            animated ? 'animate-pulse' : ''
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;