import React, { useEffect, useRef } from 'react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string | React.ReactNode;
  children: React.ReactNode;
  size?: ModalSize;
  noPadding?: boolean;
  hideCloseButton?: boolean;
  className?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
}

const sizeToMaxWidth: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  size = 'md',
  noPadding = false,
  hideCloseButton = false,
  className = '',
  ariaLabelledBy,
  ariaDescribedBy,
}) => {
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Trap focus within the modal
  useEffect(() => {
    if (!open) return;

    const focusableSelectors =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const modal = modalRef.current;
    if (!modal) return;

    const focusableEls = modal.querySelectorAll<HTMLElement>(focusableSelectors);
    const firstEl = focusableEls[0];
    const lastEl = focusableEls[focusableEls.length - 1];

    // Focus first element
    firstEl?.focus();

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        if (focusableEls.length === 0) {
          e.preventDefault();
          return;
        }
        // Shift + Tab: reverse
        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl?.focus();
          }
        } else {
          // Tab: forward
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl?.focus();
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeydown);

    return () => {
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [open, onClose]);

  if (!open) return null;

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    if (modalRef.current && e.target === modalRef.current) {
      onClose();
    }
  }

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 transition-colors"
      onClick={handleBackdropClick}
      aria-modal="true"
      role="dialog"
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      tabIndex={-1}
    >
      <div
        className={`bg-white rounded-lg shadow-lg w-full ${sizeToMaxWidth[size]} mx-3 ${className} ${
          noPadding ? '' : 'p-6'
        } relative`}
        onClick={e => e.stopPropagation()}
      >
        {(title || !hideCloseButton) && (
          <div className={`flex items-start justify-between ${noPadding ? 'pt-4 px-4' : '-mt-2 -mx-2 mb-2'}`}>
            {title && (
              <h2
                className="text-lg font-semibold leading-6 text-gray-900"
                id={ariaLabelledBy || undefined}
              >
                {title}
              </h2>
            )}
            {!hideCloseButton && (
              <button
                type="button"
                aria-label="Close"
                className="ml-auto text-gray-400 hover:text-gray-600 focus:outline-none p-2 rounded transition"
                onClick={onClose}
                tabIndex={0}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        <div>{children}</div>
      </div>
    </div>
  );
};

export default Modal;