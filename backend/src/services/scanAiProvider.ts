import { scanEnv } from '../config/env';
import { ScanProviderError, type ScanAnalysis, type ScanIssue, type ScanProviderResponse } from '../types/scan';

/** A provider turns a JPEG base64 image into a validated ScanAnalysis. */
export interface ScanAiProvider {
  readonly name: 'gemini' | 'mock';
  analyzeImage(imageBase64: string): Promise<ScanAnalysis>;
}

function clampPercent(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function clampMultiplier(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(0.7, Math.min(1.3, Math.round(numeric * 100) / 100));
}

/**
 * Only values the adapter itself derives are trusted from the model; every model-provided
 * field passes through narrowing + clamping so a malformed response cannot leak through.
 */
function toScanAnalysis(raw: unknown, model: string): ScanAnalysis {
  if (typeof raw !== 'object' || raw === null) {
    throw new ScanProviderError('invalid_response', 'AI response is not an object');
  }
  const record = raw as Record<string, unknown>;

  const isCropPhoto = record.isCropPhoto === true;
  if (!isCropPhoto) {
    const reason = typeof record.notCropReason === 'string' && record.notCropReason.trim()
      ? record.notCropReason.trim()
      : 'The image does not clearly show a crop or produce.';
    throw new ScanProviderError('not_crop', reason);
  }

  const cropRecord = (typeof record.crop === 'object' && record.crop !== null ? record.crop : {}) as Record<string, unknown>;
  const cropName = typeof cropRecord.name === 'string' && cropRecord.name.trim() ? cropRecord.name.trim() : 'Unknown crop';
  const scientificName = typeof cropRecord.scientificName === 'string' && cropRecord.scientificName.trim() ? cropRecord.scientificName.trim() : undefined;

  const qualityRecord = (typeof record.quality === 'object' && record.quality !== null ? record.quality : {}) as Record<string, unknown>;
  const gradeRaw = typeof qualityRecord.grade === 'string' ? qualityRecord.grade.trim().toUpperCase() : '';
  const grade: ScanAnalysis['quality']['grade'] = gradeRaw === 'A' || gradeRaw === 'B' || gradeRaw === 'C' ? gradeRaw : 'B';
  const score = clampPercent(qualityRecord.score, 50);
  const qualityConfidence = clampPercent(qualityRecord.confidence, 50);

  const issueTypes = ['disease', 'pest', 'nutrient_deficiency', 'quality_defect'] as const;
  const severities = ['low', 'medium', 'high'] as const;
  const issues: ScanIssue[] = Array.isArray(record.issues)
    ? record.issues.slice(0, 8).flatMap((entry): ScanIssue[] => {
      if (typeof entry !== 'object' || entry === null) return [];
      const issue = entry as Record<string, unknown>;
      const name = typeof issue.name === 'string' && issue.name.trim() ? issue.name.trim() : undefined;
      if (!name) return [];
      const type = issueTypes.find((candidate) => candidate === issue.type) ?? 'quality_defect';
      const severity = severities.find((candidate) => candidate === issue.severity) ?? 'low';
      return [{
        type,
        name,
        severity,
        confidence: clampPercent(issue.confidence, 50),
        description: typeof issue.description === 'string' ? issue.description.trim() : '',
        treatment: typeof issue.treatment === 'string' ? issue.treatment.trim() : '',
      }];
    })
    : [];

  const observations = Array.isArray(record.observations)
    ? record.observations.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim()).slice(0, 10)
    : [];

  const cropConfidence = clampPercent(cropRecord.confidence, 50);
  const multiplier = clampMultiplier(record.recommendedPriceMultiplier);

  return {
    isCropPhoto: true,
    crop: { name: cropName, scientificName, confidence: cropConfidence },
    quality: { grade, score, confidence: qualityConfidence },
    issues,
    observations,
    ...(multiplier !== undefined ? { recommendedPriceMultiplier: multiplier } : {}),
    scannedAt: new Date().toISOString(),
    model,
  };
}

const SCAN_PROMPT = `You are an agricultural produce quality inspector for an Indian farmer marketplace app.
Analyze the attached photo and respond with JSON only.

Rules:
- If the image does not clearly show a crop, fruit, vegetable, grain, or harvested produce, set isCropPhoto=false and put a short helpful explanation in notCropReason. Do not guess a crop.
- Identify the crop when possible. If unsure of the exact variety, still give the closest confident crop name.
- Assess harvest/post-harvest quality: color, uniformity, visible damage, bruising, spots, mold, pests.
- Detect likely diseases, pests, or nutrient deficiencies only when there are visible signs. If identification is uncertain, say so in the description and lower the confidence. Never claim certainty from a photo alone.
- Frame treatment as cautious guidance (cultural practices, consulting a local agri officer). Never give pesticide dosages, brand names with quantities, or dangerous chemical instructions.
- Grade A = excellent/unblemished, B = minor cosmetic issues, C = significant damage or decay.
- IMPORTANT: every confidence and score value (crop.confidence, quality.score, quality.confidence, issues[].confidence) MUST be an integer between 0 and 100, expressed as a percent. Never use a 0-to-1 scale.
- recommendedPriceMultiplier: 0.7-1.3, how this lot's price should compare to the standard market rate for the crop.
- observations: short bullet-style strings about visible quality traits.`;

const SCAN_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    isCropPhoto: { type: 'boolean' },
    notCropReason: { type: 'string', nullable: true },
    crop: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        scientificName: { type: 'string', nullable: true },
        confidence: { type: 'number' },
      },
      required: ['name', 'confidence'],
    },
    quality: {
      type: 'object',
      properties: {
        grade: { type: 'string', enum: ['A', 'B', 'C'] },
        score: { type: 'number' },
        confidence: { type: 'number' },
      },
      required: ['grade', 'score', 'confidence'],
    },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['disease', 'pest', 'nutrient_deficiency', 'quality_defect'] },
          name: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          confidence: { type: 'number' },
          description: { type: 'string' },
          treatment: { type: 'string' },
        },
        required: ['type', 'name', 'severity', 'confidence', 'description', 'treatment'],
      },
    },
    observations: { type: 'array', items: { type: 'string' } },
    recommendedPriceMultiplier: { type: 'number', nullable: true },
  },
  required: ['isCropPhoto', 'crop', 'quality', 'issues', 'observations'],
} as const;

export class GeminiScanProvider implements ScanAiProvider {
  readonly name = 'gemini' as const;

  async analyzeImage(imageBase64: string): Promise<ScanAnalysis> {
    if (!scanEnv.gemini.apiKey) {
      throw new ScanProviderError('configuration', 'GEMINI_API_KEY is required for the Gemini scan provider');
    }

    const url = `${scanEnv.gemini.apiBaseUrl}/models/${scanEnv.model}:generateContent`;
    const body = {
      contents: [{
        parts: [
          { text: SCAN_PROMPT },
          { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
        ],
      }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: SCAN_RESPONSE_SCHEMA,
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), scanEnv.gemini.timeoutMs);
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.info('[scan] Gemini request', { model: scanEnv.model, imageBytes: Math.round((imageBase64.length * 3) / 4), timeoutMs: scanEnv.gemini.timeoutMs });
      }
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': scanEnv.gemini.apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.status === 429) throw new ScanProviderError('rate_limit', 'Gemini API rate limit exceeded');
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        // Surface the API's own reason (e.g. undecodable image) — never echo request contents or credentials.
        let detail = '';
        try {
          const errBody = await response.json() as { error?: { message?: string } };
          detail = typeof errBody.error?.message === 'string' ? `: ${errBody.error.message.slice(0, 200)}` : '';
        } catch {
          // keep generic message if the body is unreadable
        }
        throw new ScanProviderError('configuration', `Gemini API rejected the request (${response.status})${detail}`);
      }
      if (!response.ok) throw new ScanProviderError('request', `Gemini API request failed (${response.status})`);

      const payload = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
      if (!text.trim()) throw new ScanProviderError('invalid_response', 'Gemini returned an empty response');

      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new ScanProviderError('invalid_response', 'Gemini response was not valid JSON');
      }
      return toScanAnalysis(raw, scanEnv.model);
    } catch (error) {
      if (error instanceof ScanProviderError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ScanProviderError('timeout', `Gemini API timed out after ${scanEnv.gemini.timeoutMs}ms`);
      }
      throw new ScanProviderError('request', error instanceof Error ? error.message : 'Gemini API request failed');
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Deterministic demo analyzer used when no provider is configured, plus as explicit fallback. */
export class MockScanProvider implements ScanAiProvider {
  readonly name = 'mock' as const;

  async analyzeImage(_imageBase64?: string): Promise<ScanAnalysis> {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return {
      isCropPhoto: true,
      crop: { name: 'Tomato', scientificName: 'Solanum lycopersicum', confidence: 94 },
      quality: { grade: 'A', score: 92, confidence: 94 },
      issues: [],
      observations: ['Good color', 'Good uniformity', 'Low visible damage'],
      recommendedPriceMultiplier: 1.08,
      scannedAt: new Date().toISOString(),
      model: 'mock-analyzer',
    };
  }
}

export function createScanAiProvider(): ScanAiProvider {
  if (scanEnv.provider === 'gemini') return new GeminiScanProvider();
  return new MockScanProvider();
}

export type { ScanProviderResponse };
