"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

/**
 * Exactly two variants exist this phase — `primary` and `ghost` — per the
 * UI-SPEC's "Component Notes". Do not add a third.
 *
 * `primary` is an --color-accent fill. Its label is ALWAYS --color-bg
 * (≈10.9:1, WCAG AA pass). Never emit --color-text on an accent fill —
 * that pairing computes to ≈1.63:1 and fails AA badly.
 */
export type ButtonVariant = "primary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

export function Button({ variant = "primary", className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-md px-4 text-[length:var(--text-label)] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed",
        variant === "primary" &&
          // Disabled drops the accent entirely rather than fading it. A 50%-opacity
          // gold over the dark ground rendered as a muddy brown that read as broken
          // rather than disabled — and accent is reserved for things you can act on.
          "bg-[var(--color-accent)] text-[var(--color-bg)] hover:brightness-95 disabled:bg-[var(--color-surface)] disabled:text-[var(--color-text-muted)] disabled:ring-1 disabled:ring-[var(--color-border)] disabled:hover:brightness-100",
        variant === "ghost" &&
          "border border-[var(--color-border)] bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface)]",
        className,
      )}
      style={{ minHeight: "var(--size-touch-min)", minWidth: "var(--size-touch-min)" }}
      {...rest}
    >
      {children}
    </button>
  );
}
