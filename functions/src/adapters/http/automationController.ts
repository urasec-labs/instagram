/**
 * ============================================================================
 * ADAPTERS / HTTP / AUTOMATION CONTROLLER
 * ----------------------------------------------------------------------------
 * Dashboard CRUD operasyonlarının HTTP adaptörü.
 *
 * Kimlik doğrulama: Firebase ID token'ı `Authorization: Bearer <token>`
 * başlığından alınır ve Admin SDK ile doğrulanır. `ownerId` ASLA istemciden
 * gelen gövdeden okunmaz → kullanıcı başkasının verisine erişemez.
 * ============================================================================
 */

import { AutomationStatus } from '../../domain/entities/Automation';
import { ValidationError } from '../../domain/errors/DomainError';
import type { HttpRequest, HttpResponse } from '../../domain/interfaces/Http';
import { ERROR_MESSAGES } from '../../domain/errors/ErrorMessages';
import type { ILogger } from '../../services/Logger';
import type { CreateAutomationUseCase } from '../../use-cases/CreateAutomation';
import type { DeleteAutomationUseCase } from '../../use-cases/DeleteAutomation';
import type { GetDashboardStatsUseCase } from '../../use-cases/GetDashboardStats';
import type { ListAutomationsUseCase } from '../../use-cases/ListAutomations';
import type { ToggleAutomationUseCase } from '../../use-cases/ToggleAutomation';
import type { ITokenVerifier } from '../../services/FirebaseTokenVerifier';
import { respondWithError, respondWithJson } from './errorMapper';

export interface AutomationControllerDependencies {
  readonly createAutomation: CreateAutomationUseCase;
  readonly toggleAutomation: ToggleAutomationUseCase;
  readonly listAutomations: ListAutomationsUseCase;
  readonly deleteAutomation: DeleteAutomationUseCase;
  readonly getDashboardStats: GetDashboardStatsUseCase;
  readonly tokenVerifier: ITokenVerifier;
  readonly logger: ILogger;
}

/** Gövdeden okunabilecek alanlar (bilinmeyen alanlar yok sayılır). */
interface RawAutomationBody {
  readonly name?: unknown;
  readonly keywords?: unknown;
  readonly matchMode?: unknown;
  readonly replyMessage?: unknown;
  readonly trigger?: unknown;
  readonly status?: unknown;
}

export class AutomationController {
  public constructor(private readonly deps: AutomationControllerDependencies) {}

  /** Tek giriş noktası — yönlendirme burada yapılır. */
  public handle(request: HttpRequest, response: HttpResponse): void {
    void this.route(request, response);
  }

  private async route(request: HttpRequest, response: HttpResponse): Promise<void> {
    try {
      const ownerId = await this.deps.tokenVerifier.verify(request);

      const method = request.method.toUpperCase();
      const segments = this.parseSegments(request);
      const resource = segments[0] ?? '';

      // --- GET /api/automations            → listeleme ----------------------
      // --- POST /api/automations           → oluşturma ---------------------
      if (method === 'GET' && resource === 'automations') {
        const result = await this.deps.listAutomations.execute(ownerId, {
          status: this.readStatusFilter(request),
        });
        respondWithJson(response, 200, { ok: true, ...result });
        return;
      }

      if (method === 'GET' && resource === 'stats') {
        const result = await this.deps.getDashboardStats.execute(ownerId);
        respondWithJson(response, 200, { ok: true, ...result });
        return;
      }

      if (method === 'POST' && resource === 'automations') {
        const body = this.readBody(request);
        const result = await this.deps.createAutomation.execute(ownerId, {
          name: this.readString(body.name, 'name'),
          keywords: this.readStringArray(body.keywords, 'keywords'),
          matchMode: this.readString(body.matchMode, 'matchMode'),
          replyMessage: this.readString(body.replyMessage, 'replyMessage'),
          trigger: this.readString(body.trigger, 'trigger'),
        });
        respondWithJson(response, 201, { ok: true, ...result });
        return;
      }

      // --- PATCH /api/automations/{id}/status → aktif/pasif ----------------
      if (method === 'PATCH' && resource === 'automations' && segments[1] !== undefined) {
        const body = this.readBody(request);
        const result = await this.deps.toggleAutomation.execute(ownerId, segments[1], {
          status: this.readOptionalStatus(body.status) ?? undefined,
        });
        respondWithJson(response, 200, { ok: true, ...result });
        return;
      }

      // --- DELETE /api/automations/{id} → silme ----------------------------
      if (method === 'DELETE' && resource === 'automations' && segments[1] !== undefined) {
        await this.deps.deleteAutomation.execute(ownerId, segments[1]);
        respondWithJson(response, 200, { ok: true, deletedId: segments[1] });
        return;
      }

      response.status(404).json({
        ok: false,
        error: { code: 'ROUTE_NOT_FOUND', message: ERROR_MESSAGES.NOT_FOUND },
      });
    } catch (error: unknown) {
      respondWithError(response, error, this.deps.logger, { stage: 'automation.route' });
    }
  }

  /** `/api/automations/123/status` → `['automations','123','status']` */
  private parseSegments(request: HttpRequest): readonly string[] {
    const rawPath = request.query['__path'];

    if (typeof rawPath === 'string') {
      return rawPath.split('/').filter((segment) => segment.length > 0);
    }

    return [];
  }

  /** Enum değerlerini güvenli şekilde okur (string literal → enum casti). */
  private readStatusFilter(request: HttpRequest): AutomationStatus | null {
    return this.toStatus(request.query['status']);
  }

  private readOptionalStatus(value: unknown): AutomationStatus | null {
    return this.toStatus(value);
  }

  private toStatus(value: unknown): AutomationStatus | null {
    const raw = Array.isArray(value) ? value[0] : value;

    if (raw === AutomationStatus.ACTIVE || raw === AutomationStatus.PASSIVE) {
      return raw;
    }

    return null;
  }

  /**
   * Gövdeyi JSON olarak okur.
   * Parse hatası → ValidationError (client hatası, 422).
   */
  private readBody(request: HttpRequest): RawAutomationBody {
    try {
      const parsed: unknown = JSON.parse(request.rawBody);

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new ValidationError('Gövde bir JSON nesnesi olmalıdır.');
      }

      return parsed as RawAutomationBody;
    } catch (error: unknown) {
      if (error instanceof ValidationError) {
        throw error;
      }

      throw new ValidationError(ERROR_MESSAGES.INVALID_JSON);
    }
  }

  private readString(value: unknown, field: string): string {
    if (typeof value !== 'string') {
      throw new ValidationError(`"${field}" alanı zorunludur ve metin olmalıdır.`, { field });
    }

    return value;
  }

  

  private readStringArray(value: unknown, field: string): readonly string[] {
    if (!Array.isArray(value)) {
      throw new ValidationError(`"${field}" alanı bir dizi olmalıdır.`, { field });
    }

    return value.filter((item): item is string => typeof item === 'string');
  }
}