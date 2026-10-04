/**
 * ============================================================================
 * USE-CASES / CREATE AUTOMATION
 * ----------------------------------------------------------------------------
 * Otomasyon oluşturma iş kuralı.
 *
 * Sorumluluk: girdiyi doğrula, varsayılanları uygula, repository'ye yaz.
 * Controller'daki HTTP detayları, repository'deki SQL/Firestore detayları
 * buraya BULAŞMAZ (SRP).
 * ============================================================================
 */

import { AutomationTrigger, MatchMode, type Automation } from '../domain/entities/Automation';
import { createAutomationEntity } from '../domain/validation/AutomationValidator';
import type { IAutomationRepository } from '../domain/interfaces/IAutomationRepository';
import type { ILogger } from '../services/Logger';

/** HTTP'den gelen ham (henüz doğrulanmamış) gövde. */
export interface CreateAutomationRequest {
  readonly name: string;
  readonly keywords: readonly string[];
  readonly matchMode: string;
  readonly replyMessage: string;
  readonly trigger: string;
  /** İstemci isterse belirli bir ID ile oluşturabilir (offline-first UI için). */
  readonly id?: string | undefined;
}

export interface CreateAutomationResponse {
  readonly automation: Automation;
}

export class CreateAutomationUseCase {
  public constructor(
    private readonly automations: IAutomationRepository,
    private readonly logger: ILogger,
  ) {}

  public async execute(
    ownerId: string,
    request: CreateAutomationRequest,
  ): Promise<CreateAutomationResponse> {
    const now = new Date();

    // Domain factory: doğrulama + normalize + varsayılanları TEK yerde uygular.
    const entity = createAutomationEntity({
      id: request.id ?? crypto.randomUUID(),
      ownerId,
      name: request.name,
      keywords: request.keywords,
      // Geçersiz enum değerleri ValidationError fırlatır (sessizce düşmez).
      matchMode: request.matchMode as MatchMode,
      replyMessage: request.replyMessage,
      trigger: request.trigger as AutomationTrigger,
      now,
    });

    const created = await this.automations.create({
      id: entity.id,
      ownerId: entity.ownerId,
      name: entity.name,
      keywords: entity.keywords,
      matchMode: entity.matchMode,
      replyMessage: entity.replyMessage,
      trigger: entity.trigger,
      now,
    });

    this.logger.info('Otomasyon oluşturuldu.', {
      automationId: created.id,
      ownerId,
      keywordCount: created.keywords.length,
      matchMode: created.matchMode,
    });

    return { automation: created };
  }
}