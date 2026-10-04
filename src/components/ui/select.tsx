/**
 * ============================================================================
 * UI / SELECT (Shadcn UI — native select tabanlı)
 * ----------------------------------------------------------------------------
 * Sadece 2-3 seçeneği olan alanlarda (eşleşme modu, tetikleyici tipi) native
 * `<select>` kullanmak: erişilebilirliği bedavaya mal etmeden yeterli olur.
 * ============================================================================
 */

'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

export interface SelectOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
}

export interface SelectProps<T extends string>
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  options: readonly SelectOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
}

function Select<T extends string>({
  options,
  value,
  onValueChange,
  className,
  ...props
}: SelectProps<T>): JSX.Element {
  return (
    <div className="relative">
      <select
        // `value`/`onChange` dışarıdan kontrollü gelir; Radix olmadan da
        // aynı sözleşmeyi koruyoruz.
        value={value}
        onChange={(event) => {
          const next = event.target.value as T;
          onValueChange(next);
        }}
        className={cn(
          'flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {/* Chevron ikonu: native select oku kapatılır, özel ikon konur. */}
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export { Select };