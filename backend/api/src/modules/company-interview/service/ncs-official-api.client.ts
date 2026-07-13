import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  NcsOfficialElementInput,
  NcsOfficialUnitInput,
} from '../ncs-evaluation-profile.types';

const DEFAULT_BASE_URL = 'https://apis.data.go.kr/B490007/hrdkapi';
const OFFICIAL_SOURCE_URL = 'https://www.data.go.kr/data/15128213/openapi.do';
const OFFICIAL_PROVIDER = '한국산업인력공단';

@Injectable()
export class NcsOfficialApiClient {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.serviceKey());
  }

  async searchUnits(query: string, limit = 30): Promise<NcsOfficialUnitInput[]> {
    const serviceKey = this.serviceKey();
    if (!serviceKey) {
      return [];
    }

    const boundedLimit = Math.max(1, Math.min(limit, 100));
    const url = new URL(`${this.baseUrl().replace(/\/$/, '')}/NCS007`);
    url.search = new URLSearchParams({
      serviceKey,
      pageNo: '1',
      numOfRows: String(boundedLimit),
      LVL: this.config.get<string>('NCS_PUBLIC_DATA_SEARCH_LEVEL')?.trim() || '1',
      SWRD: query.trim(),
      SNUM: '1',
      ENUM: String(boundedLimit),
    }).toString();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`NCS official API returned HTTP ${response.status}.`);
      }
      const payload = (await response.json()) as unknown;
      return normalizeOfficialSearchPayload(payload, this.sourceUpdatedAt());
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      throw new Error(`공식 NCS 기준정보 조회에 실패했습니다: ${reason}`);
    } finally {
      clearTimeout(timer);
    }
  }

  source(): { sourceProvider: string; sourceUrl: string } {
    return { sourceProvider: OFFICIAL_PROVIDER, sourceUrl: OFFICIAL_SOURCE_URL };
  }

  private serviceKey(): string | undefined {
    return this.config.get<string>('NCS_PUBLIC_DATA_SERVICE_KEY')?.trim() || undefined;
  }

  private baseUrl(): string {
    return this.config.get<string>('NCS_PUBLIC_DATA_BASE_URL')?.trim() || DEFAULT_BASE_URL;
  }

  private sourceUpdatedAt(): string {
    return this.config.get<string>('NCS_CATALOG_SOURCE_UPDATED_AT')?.trim() || '2025-06-09';
  }

  private timeoutMs(): number {
    const configured = Number(this.config.get<string>('NCS_PUBLIC_DATA_TIMEOUT_MS'));
    return Number.isFinite(configured) && configured >= 1000 ? configured : 10000;
  }
}

export function normalizeOfficialSearchPayload(
  payload: unknown,
  sourceUpdatedAt = '2025-06-09',
): NcsOfficialUnitInput[] {
  const root = asRecord(payload) ?? {};
  const responseRoot = asRecord(root.response) ?? root;
  const header = asRecord(responseRoot.header);
  const resultCode = textOf(header?.resultCode);
  if (resultCode && !['0', '00', '200'].includes(resultCode)) {
    if (resultCode === '03') {
      return [];
    }
    throw new Error(textOf(header?.resultMsg) || `NCS API resultCode ${resultCode}`);
  }

  const body = asRecord(responseRoot.body);
  const items = asRecord(body?.items);
  const rawItems = items?.item;
  const rows = (Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [])
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => item !== undefined);

  const grouped = new Map<string, NcsOfficialUnitInput>();
  for (const row of rows) {
    const classificationCode = textOf(row.NCS_CL_CD);
    const unitCode = textOf(row.NCS_COMPE_UNIT_CD);
    const unitName = textOf(row.COMPE_UNIT_NAME);
    const ncsDegree = textOf(row.NCS_DEGR) || 'UNKNOWN';
    const version = textOf(row.VER_NO) || ncsDegree;
    if (!classificationCode || !unitCode || !unitName) {
      continue;
    }

    const key = `${classificationCode}:${version}`;
    const unit = grouped.get(key) ?? {
      unitCode,
      classificationCode,
      unitName,
      definition: optionalText(row.DEF) ?? optionalText(row.COMPE_UNIT_DEF),
      unitLevel: optionalText(row.LEVEL) ?? optionalText(row.COMPE_UNIT_LEVEL),
      developmentYear: optionalText(row.DEVEL_YY),
      version,
      ncsDegree,
      isCurrent: textOf(row.USG_YN).toUpperCase() !== 'N',
      largeCategoryCode: textOf(row.NCS_LCLAS_CD),
      largeCategoryName: textOf(row.NCS_LCLAS_CDNM),
      mediumCategoryCode: textOf(row.NCS_MCLAS_CD),
      mediumCategoryName: textOf(row.NCS_MCLAS_CDNM),
      smallCategoryCode: textOf(row.NCS_SCLAS_CD),
      smallCategoryName: textOf(row.NCS_SCLAS_CDNM),
      subdivisionCode: textOf(row.NCS_SUBD_CD),
      subdivisionName: textOf(row.NCS_SUBD_CDNM),
      dutyDefinition: optionalText(row.DUTY_DEF),
      sourceProvider: OFFICIAL_PROVIDER,
      sourceUrl: OFFICIAL_SOURCE_URL,
      sourceUpdatedAt,
      rawData: row,
      elements: [],
    } satisfies NcsOfficialUnitInput;

    const element = normalizeElement(row);
    if (element && !unit.elements.some((item) => item.elementCode === element.elementCode)) {
      unit.elements.push(element);
    }
    grouped.set(key, unit);
  }

  return [...grouped.values()];
}

function normalizeElement(row: Record<string, unknown>): NcsOfficialElementInput | undefined {
  const elementCode = textOf(row.COMPE_UNIT_FACTR_NO_CD);
  const elementNumber = textOf(row.COMPE_UNIT_FACTR_NO);
  const elementName = textOf(row.COMPE_UNIT_FACTR_NAME);
  if (!elementCode || !elementNumber || !elementName) {
    return undefined;
  }
  return {
    elementCode,
    elementNumber,
    elementName,
    elementLevel: optionalText(row.COMPE_UNIT_FACTR_LEVEL),
    rawData: row,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function textOf(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\s+/g, ' ').trim()
    : '';
}

function optionalText(value: unknown): string | undefined {
  return textOf(value) || undefined;
}
