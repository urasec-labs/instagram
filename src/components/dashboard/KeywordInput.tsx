/**
 * ============================================================================
 * DASHBOARD / KEYWORD INPUT
 * ----------------------------------------------------------------------------
 * Tetikleyici kelimeleri Tag/Badge formatında yöneten dinamik input.
 *
 * DAVRANIŞ:
 *  - Enter veya virgül ile kelime ekler
 *  - Backspace boş input'ta son kelimeyi siler ( tagging UX'i)
 *  - Tekrar eden kelimeler eklenmez (normalize edilerek karşılaştırılır)
 *  - Maksimum kelime sayısı aşılırsa yeni kelime eklenmez ve kullanıcı uyarılır
 *
 * `maxKeywords` backend limitiyle (30) aynı değer kullanır.
 * ============================================================================
 */

'use client';

import * as React from 'react';
import { X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn, normalizeKeyword } from '@/lib/utils';

export interface KeywordInputProps {
  /** Seçili kelimeler (normalize edilmiş). */
  value: readonly string[];
  /** Kelime eklendiğinde/çıkarıldığında çağrılır. */
  onChange: (keywords: string[]) => void;
  /** Azami kelime sayısı (backend limitiyle aynı olmalı). */
  maxKeywords?: number;
  /** Tek bir kelimenin azami uzunluğu. */
  maxKeywordLength?: number;
  /** Form doğrulama hatası gösterilsin mi? */
  invalid?: boolean;
  disabled?: boolean;
}

/**
 * Bir kelimenin etikette gösterilecek kısaltılmış hâli.
 * @param keyword  Normalize edilmiş kelime
 * @param maxLength etikette gösterilecek azami karakter
 */
function displayKeyword(keyword: string, maxLength: number): string {
  // 20 karakterden kısaysa tamamını göster → kırpma gereksiz.
  if (keyword.length <= maxLength) {
    return keyword;
  }

  return `${keyword.slice(0, maxLength)}…`;
}

export function KeywordInput({
  value,
  onChange,
  maxKeywords = 30,
  maxKeywordLength = 60,
  invalid = false,
  disabled = false,
}: KeywordInputProps): JSX.Element {
  const [draft, setDraft] = React.useState<string>('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  /** Kelime ekleme iş mantığı (tek kaynak → hem Enter hem virgül aynı yolu kullanır). */
  const commitDraft = React.useCallback((): void => {
    // Virgül ile ayrılmış çoklu kelimeleri tek seferde işle.
    const candidates = draft
      .split(',')
      .map(normalizeKeyword)
      .filter((keyword) => keyword.length > 0);

    if (candidates.length === 0) {
      setDraft('');
      return;
    }

    const next = [...value];

    for (const candidate of candidates) {
      if (candidate.length > maxKeywordLength) {
        continue;
      }

      // Guard: tekrar ve limit kontrolleri.
      if (next.includes(candidate) || next.length >= maxKeywords) {
        continue;
      }

      next.push(candidate);
    }

    onChange(next);
    setDraft('');
  }, [draft, maxKeywordLength, maxKeywords, onChange, value]);

  const removeKeyword = React.useCallback(
    (keyword: string): void => {
      onChange(value.filter((item) => item !== keyword));
    },
    [onChange, value],
  );

  /** Klavyeyle özel davranış. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault(); // Form'un submit olmasını engelle
      commitDraft();
      return;
    }

    // Backspace: input boşsa son etiketi kaldır (bilinen tagging davranışı)
    if (event.key === 'Backspace' && draft.length === 0 && value.length > 0) {
      event.preventDefault();
      const last = value[value.length - 1];

      if (last !== undefined) {
        removeKeyword(last);
      }
    }
  };

  /**
   * Virgül içeren metin yapıştırıldığında: tarayıcının varsayılan davranışını
   * engelleyip kelimeleri tek seferde commit ediyoruz.
   *
   * `draftRef` kullanılır çünkü `setDraft` asenkrondur; aynı event içinde
   * state okunursa ESKİ değer görülür (stale closure hatası).
   */
  const draftRef = React.useRef<string>(draft);

  React.useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>): void => {
    const pasted = event.clipboardData.getData('text');

    if (!pasted.includes(',')) {
      return;
    }

    event.preventDefault();

    const combined = `${draftRef.current}${pasted}`;
    const candidates = combined
      .split(',')
      .map(normalizeKeyword)
      .filter((keyword) => keyword.length > 0);

    const next = [...value];

    for (const candidate of candidates) {
      if (candidate.length > maxKeywordLength) {
        continue;
      }

      if (next.includes(candidate) || next.length >= maxKeywords) {
        continue;
      }

      next.push(candidate);
    }

    onChange(next);
    setDraft('');
  };

  /** Etiketlerde gösterilecek azami karakter sayısı. */
  const displayLimit = Math.min(20, maxKeywordLength);

  const isLimitReached = value.length >= maxKeywords;

  return (
    <div className="space-y-2">
      {/* --- Seçili kelimeler (Badge/Tag listesi) --- */}
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((keyword) => (
            <Badge
              key={keyword}
              variant="secondary"
              className="group gap-1 pl-2.5 pr-1 py-1 font-normal"
            >
              <span title={keyword}>{displayKeyword(keyword, displayLimit)}</span>
              <button
                type="button"
                onClick={() => {
                  removeKeyword(keyword);
                }}
                disabled={disabled}
                className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-destructive/20 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive disabled:opacity-50"
                aria-label={`${keyword} kelimesini kaldır`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}

      {/* --- Giris alanı --- */}
      <div className="relative">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          onPaste={handlePaste}
          onClick={() => {
            inputRef.current?.focus();
          }}
          disabled={disabled}
          invalid={invalid}
          placeholder={
            isLimitReached
              ? `Azami ${maxKeywords} kelimeye ulaşıldı`
              : 'Kelime yazıp Enter\'a basın (örn: fiyat, kargo)'
          }
          aria-label="Tetikleyici kelime ekle"
          className={cn('pr-16', !isLimitReached && value.length > 0 && 'border-primary/40')}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {value.length}/{maxKeywords}
        </span>
      </div>

      {isLimitReached ? (
        <p className="text-xs text-warning">Azami {maxKeywords} tetikleyici kelime kullanabilirsiniz.</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Büyük/küçük harf ve Türkçe karakter farkları eşleşmeyi etkilemez.
        </p>
      )}
    </div>
  );
}