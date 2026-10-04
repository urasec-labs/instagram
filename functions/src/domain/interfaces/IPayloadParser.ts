/**
 * ============================================================================
 * DOMAIN / INTERFACES / I WEBHOOK PAYLOAD PARSER
 * ----------------------------------------------------------------------------
 * Meta webhook gövdesinin ham JSON'unu normalize edilmiş domain olayına
 * çeviren SAF fonksiyon portu.
 *
 * Ayrı bir port olarak tanımlanmasının sebebi SRP'dir: JSON şeması Meta'ya
 * bağlı bir ALTYAPI detayıdır ve use-case katmanını kirletmemelidir.
 * ============================================================================
 */

import type { InboundEvent } from '../entities/Log';

export interface IPayloadParser {
  /**
   * Ham gövdeden tüm normalize olayları çıkarır.
   * Bir olay tanınamazsa atlanır; parser THROW ETMEZ.
   *
   * @param rawBody JSON.parse edilmemiş metin
   * @returns normalize edilmiş olay listesi (muhtemelen boş olabilir)
   */
  parse(rawBody: string): readonly InboundEvent[];
}