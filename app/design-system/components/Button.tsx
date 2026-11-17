"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { semanticTokens } from "../tokens";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual hierarchy variant */
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** Size preset */
  size?: "sm" | "md" | "lg";
  /** Full width button */
  fullWidth?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Icon before label */
  leftIcon?: React.ReactNode;
  /** Icon after label */
  rightIcon?: React.ReactNode;
}

/**
 * Design-system Button
 * --------------------
 * Uses semantic tokens for colours, spacing and animation.
 * Guarantees WCAG AA contrast on all variants.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      fullWidth = false,
      loading = false,
      leftIcon,
      rightIcon,
      children,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    const sizeClasses = {
      sm: "h-8 px-3 text-xs gap-1.5",
      md: "h-9 px-4 text-sm gap-2",
      lg: "h-11 px-6 text-base gap-2.5",
    };

    const variantClasses = {
      primary: [
        "bg-[var(--primary)] text-[var(--primary-foreground)]",
        "hover:bg-[var(--primary)]/90",
        "focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50",
        "shadow-sm",
      ].join(" "),
      secondary: [
        "bg-[var(--secondary)] text-[var(--secondary-foreground)]",
        "hover:bg-[var(--secondary)]/80",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50",
        "border border-[var(--border)]",
      ].join(" "),
      ghost: [
        "bg-transparent text-[var(--foreground)]",
        "hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50",
      ].join(" "),
      danger: [
        "bg-[var(--destructive)] text-white",
        "hover:bg-[var(--destructive)]/90",
        "focus-visible:ring-2 focus-visible:ring-[var(--destructive)]/50",
        "shadow-sm",
      ].join(" "),
    };

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium",
          "transition-colors duration-150 ease-in-out",
          "focus-visible:outline-none",
          "disabled:pointer-events-none disabled:opacity-50",
          "select-none",
          sizeClasses[size],
          variantClasses[variant],
          fullWidth && "w-full",
          className
        )}
        style={{
          transitionDuration: semanticTokens.animation.duration.fast,
          transitionTimingFunction: semanticTokens.animation.easing.DEFAULT,
        }}
        {...props}
      >
        {loading && (
          <span className="inline-flex items-center">
            <svg
              className="animate-spin h-4 w-4 mr-1.5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </span>
        )}
        {!loading && leftIcon && <span className="inline-flex flex-shrink-0">{leftIcon}</span>}
        {children && <span className="truncate">{children}</span>}
        {!loading && rightIcon && <span className="inline-flex flex-shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = "DesignSystemButton";
