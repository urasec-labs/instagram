/**
 * ============================================================================
 * TESTS / KEYWORD MATCHER (node:test)
 * ----------------------------------------------------------------------------
 * Domain katmanının saf fonksiyonları için birim testleri.
 *
 * Çalıştırma:  cd functions && npx tsc -p tsconfig.json && node --test lib/tests/
 * (veya)       cd functions && npm run test
 *
 * Neden ayrı test framework yok? Node 20'nin yerleşik `node:test` runner'ı
 * yeterlidir → sıfır bağımlılık, hızlı CI.
 * ============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  clampToInstagramLimit,
  doesKeywordMatch,
  findMatchingKeyword,
  renderTemplate,
  selectMatchingAutomation,
  selectStrictestMatch,
} from '../domain/matchers/KeywordMatcher';
import {
  AutomationStatus,
  AutomationTrigger,
  MatchMode,
  normalizeKeywords,
  normalizeText,
} from '../domain/entities/Automation';
import type { Automation } from '../domain/entities/Automation';

/** Test verisi için minimal otomasyon fabrikası. */
function makeAutomation(partial: Partial<Automation> = {}): Automation {
  return {
    id: partial.id ?? 'auto-1',
    ownerId: 'user-1',
    name: partial.name ?? 'Test',
    keywords: partial.keywords ?? ['fiyat'],
    matchMode: partial.matchMode ?? MatchMode.CONTAINS,
    replyMessage: partial.replyMessage ?? 'Merhaba!',
    trigger: partial.trigger ?? AutomationTrigger.INBOUND_MESSAGE,
    status: partial.status ?? AutomationStatus.ACTIVE,
    stats: partial.stats ?? { matchCount: 0, replyCount: 0, failureCount: 0, lastTriggeredAt: null },
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...partial,
  } as Automation;
}

describe('normalizeText', () => {
  test('küçük harfe indirger ve kırpar', () => {
    assert.equal(normalizeText('  FİYAT  '), 'fiyat');
  });

  test('Türkçe büyük I harfini i yapar', () => {
    assert.equal(normalizeText('İSTANBUL'), 'istanbul');
  });

  test('ardışık boşlukları tek boşluğa indirger', () => {
    assert.equal(normalizeText('merhaba    dünya'), 'merhaba dünya');
  });

  test('girdi string değilse boş döner (guard clause)', () => {
    assert.equal(normalizeText(''), '');
  });
});

describe('normalizeKeywords', () => {
  test('tekrarları siler ve sırayı korur', () => {
    assert.deepEqual(normalizeKeywords(['Fiyat', 'fiyat', '  KARGO ']), ['fiyat', 'kargo']);
  });

  test('baştaki # işaretini temizler', () => {
    assert.deepEqual(normalizeKeywords(['#Fiyat']), ['fiyat']);
  });

  test('boş kelimeleri atar', () => {
    assert.deepEqual(normalizeKeywords(['', '   ', '#']), []);
  });
});

describe('doesKeywordMatch', () => {
  test('EXACT modu birebir eşleşme ister', () => {
    assert.equal(doesKeywordMatch('fiyat', 'fiyat', MatchMode.EXACT), true);
    assert.equal(doesKeywordMatch('fiyat', 'fiyat nedir', MatchMode.EXACT), false);
  });

  test('CONTAINS modu alt dize arar', () => {
    assert.equal(doesKeywordMatch('fiyat', 'ürün fiyatı nedir', MatchMode.CONTAINS), true);
    assert.equal(doesKeywordMatch('fiyat', 'kargo', MatchMode.CONTAINS), false);
  });

  test('boş metin eşleşmez (guard clause)', () => {
    assert.equal(doesKeywordMatch('fiyat', '', MatchMode.CONTAINS), false);
  });
});

describe('findMatchingKeyword', () => {
  test('ilk eşleşen kelimeyi döndürür', () => {
    assert.equal(
      findMatchingKeyword(['kargo', 'fiyat'], 'fiyat sorusu', MatchMode.CONTAINS),
      'fiyat',
    );
  });

  test('eşleşme yoksa null döner', () => {
    assert.equal(findMatchingKeyword(['fiyat'], 'merhaba', MatchMode.CONTAINS), null);
  });
});

describe('selectMatchingAutomation', () => {
  test('en uzun kelime kazanır (spesifiklik önceliği)', () => {
    const short = makeAutomation({ id: 'a', keywords: ['fiyat'] });
    const long = makeAutomation({ id: 'b', keywords: ['fiyat listesi'] });

    const result = selectMatchingAutomation(
      [short, long],
      'fiyat listesi nedir',
      'ali',
      new Date('2024-06-01T10:00:00.000Z'),
    );

    assert.notEqual(result, null);
    assert.equal(result?.automation.id, 'b');
    assert.equal(result?.keyword, 'fiyat listesi');
  });

  test('pasif otomasyon tetiklenmez', () => {
    const passive = makeAutomation({ status: AutomationStatus.PASSIVE });

    const result = selectMatchingAutomation([passive], 'fiyat', 'ali', new Date());

    assert.equal(result, null);
  });

  test('boş metin eşleşme üretmez', () => {
    assert.equal(selectMatchingAutomation([makeAutomation()], '   ', null, new Date()), null);
  });

  test('kullanıcı adı değişkeni üretilir', () => {
    const result = selectMatchingAutomation(
      [makeAutomation()],
      'fiyat',
      'mehmet',
      new Date('2024-06-01T10:00:00.000Z'),
    );

    assert.equal(result?.variables['username'], 'mehmet');
    assert.equal(result?.variables['keyword'], 'fiyat');
  });
});

describe('selectStrictestMatch', () => {
  test('en uzun sözlük kelimesi kazanır', () => {
    const dictionary = new Map<string, MatchMode>([
      ['fiyat', MatchMode.CONTAINS],
      ['fiyat listesi', MatchMode.CONTAINS],
    ]);

    assert.deepEqual(selectStrictestMatch(dictionary, 'fiyat listesi'), {
      keyword: 'fiyat listesi',
      mode: MatchMode.CONTAINS,
    });
  });
});

describe('renderTemplate', () => {
  test('değişkenleri değiştirir', () => {
    assert.equal(
      renderTemplate('Merhaba {username}, {time}', { username: 'ali', time: '10:00' }),
      'Merhaba ali, 10:00',
    );
  });

  test('bilinmeyen değişken korunur (sessiz veri kaybı olmaz)', () => {
    assert.equal(renderTemplate('{unknown}', { username: 'ali' }), '{unknown}');
  });
});

describe('clampToInstagramLimit', () => {
  test('limitin altındaki metne dokunmaz', () => {
    assert.equal(clampToInstagramLimit('  kısa  '), 'kısa');
  });

  test('uzun metni kelime sınırında keser', () => {
    const long = 'a'.repeat(1200);
    const result = clampToInstagramLimit(long);

    assert.ok(result.length <= 1000);
    assert.ok(result.endsWith('…'));
  });
});