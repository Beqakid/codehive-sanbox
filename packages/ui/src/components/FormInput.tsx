import React, { forwardRef, InputHTMLAttributes, ReactNode } from "react";

export type FormInputProps = {
  label?: string;
  name: string;
  type?: InputHTMLAttributes<HTMLInputElement>["type"];
  value?: string | number;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  placeholder?: string;
  required?: boolean;
  error?: string | ReactNode;
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
  leftAddon?: ReactNode;
  rightAddon?: ReactNode;
  disabled?: boolean;
  autoFocus?: boolean;
  min?: number | string;
  max?: number | string;
  step?: number | string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur" | "name" | "type" | "className" | "placeholder">;

const baseLabel =
  "block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1";
const baseInput =
  "appearance-none block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-400 dark:bg-gray-900 dark:border-gray-700 dark:placeholder-gray-500";
const baseError = "mt-1 text-xs text-red-600 dark:text-red-400";

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  (
    {
      label,
      name,
      type = "text",
      value,
      onChange,
      onBlur,
      placeholder,
      required,
      error,
      className,
      labelClassName,
      inputClassName,
      leftAddon,
      rightAddon,
      disabled,
      autoFocus,
      min,
      max,
      step,
      ...rest
    },
    ref
  ) => {
    return (
      <div className={className}>
        {label && (
          <label
            htmlFor={name}
            className={`${baseLabel}${labelClassName ? " " + labelClassName : ""}`}
          >
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}
        <div className="flex items-stretch">
          {leftAddon && (
            <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 text-gray-500 text-sm">
              {leftAddon}
            </span>
          )}
          <input
            id={name}
            name={name}
            ref={ref}
            type={type}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            autoFocus={autoFocus}
            min={min}
            max={max}
            step={step}
            className={[
              baseInput,
              leftAddon ? "rounded-l-none" : "",
              rightAddon ? "rounded-r-none" : "",
              error
                ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                : "",
              inputClassName ? inputClassName : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-invalid={!!error}
            aria-describedby={error ? `${name}-error` : undefined}
            {...rest}
          />
          {rightAddon && (
            <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 text-gray-500 text-sm">
              {rightAddon}
            </span>
          )}
        </div>
        {error && (
          <div id={`${name}-error`} className={baseError} role="alert">
            {error}
          </div>
        )}
      </div>
    );
  }
);

FormInput.displayName = "FormInput";

export default FormInput;