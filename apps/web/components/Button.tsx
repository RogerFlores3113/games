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
        "inline-flex items-center justify-center gap-2 rounded-md px-4 text-[length:var(--text-label)] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-[var(--color-accent)] text-[var(--color-bg)] hover:brightness-95",
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
