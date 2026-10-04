/**
 * ============================================================================
 * USE-CASES / LIST AUTOMATIONS
 * ----------------------------------------------------------------------------
 * Bir kullanıcının otomasyonlarını listeler (dashboard tablosu).
 * Sahiplik filtresi repository sorgusunda uygulanır → istemci tarafında
 * filtreleme yapılmaz (veri sızıntısı olmaz).
 * ============================================================================
 */

import type { Automation } from '../domain/entities/Automation';
import type { IAutomationRepository } from '../domain/interfaces/IAutomationRepository';

export interface ListAutomationsRequest {
  readonly status?: 'ACTIVE' | 'PASSIVE' | null;
  readonly limit?: number;
}

export interface ListAutomationsResponse {
  readonly automations: readonly Automation[];
}

export class ListAutomationsUseCase {
  public constructor(private readonly automations: IAutomationRepository) {}

  public async execute(
    ownerId: string,
    request: ListAutomationsRequest = {},
  ): Promise<ListAutomationsResponse> {
    const automations = await this.automations.list({
      ownerId,
      status: request.status ?? null,
      limit: Math.min(Math.max(request.limit ?? 100, 1), 200),
    });

    return { automations };
  }
}