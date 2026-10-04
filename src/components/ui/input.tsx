/**
 * ============================================================================
 * UI / INPUT (Shadcn UI)
 * ----------------------------------------------------------------------------
 * Erişilebilir metin giriş alanı: `<label>` bağlantısı, hata mesajı için
 * `aria-invalid` desteği.
 * ============================================================================
 */

'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Hata durumu: kırmızı kenarlık + erişilebilir hata işareti. */
  invalid?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, invalid = false, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      aria-invalid={invalid}
      className={cn(
        'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        // Koşullu sınıflar: normal → border-input, hatalı → border-destructive.
        invalid ? 'border-destructive focus-visible:ring-destructive' : 'border-input',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };