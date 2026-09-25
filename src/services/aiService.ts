import { getApiBaseUrl } from './apiClient';
import type { ScanIssue, ScanResult, ScanSource } from '@/types/app';

export type { ScanIssue, ScanResult, ScanSource };

export type ScanErrorKind = 'not_crop' | 'backend_unavailable' | 'provider_unavailable' | 'quota' | 'request' | 'invalid_image';

export type ScanOutcome = {
  result?: ScanResult;
  source: ScanSource;
  fallback: boolean;
  error?: string;
  errorKind?: ScanErrorKind;
  /** True when the picture was analyzed but was not a usable crop/produce photo. */
  isCropPhoto?: boolean;
  notCropReason?: string;
};

/** Matches the backend's ScanProviderError taxonomy. */
type ScanApiErrorBody = {
  error?: string;
  source?: ScanSource;
  fallback?: boolean;
  result?: ScanResult;
};

type ScanApiSuccessBody = {
  result?: ScanResult;
  source?: ScanSource;
  fallback?: boolean;
  error?: string;
};

const SCAN_REQUEST_TIMEOUT_MS = 45_000;
const SCAN_API_PATH = '/api/scan/quality';

/**
 * Demo analyzer, used only as an explicit fallback: backend unreachable, provider down,
 * or quota exhausted. Never presented as real AI.
 */
export async function analyzeProduceMock(crop = 'Tomato', _image?: string): Promise<ScanResult> {
  await new Promise((resolve) => setTimeout(resolve, 900));
  return {
    isCropPhoto: true,
    crop: { name: crop, confidence: 94 },
    quality: { grade: 'A', score: 92, confidence: 94 },
    issues: [],
    observations: ['Good color', 'Good uniformity', 'Low visible damage'],
    recommendedPriceMultiplier: 1.08,
    scannedAt: new Date().toISOString(),
    model: 'mock-analyzer',
  };
}

export async function analyzeProduce(input: {
  imageBase64: string;
  mimeType?: string;
  cropHint?: string;
}): Promise<ScanOutcome> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    return {
      result: await analyzeProduceMock(input.cropHint ?? 'Tomato', input.imageBase64),
      source: 'mock',
      fallback: true,
      error: 'Backend URL is not configured; showing demo analysis',
      errorKind: 'backend_unavailable',
    };
  }

  const requestUrl = `${apiBaseUrl}${SCAN_API_PATH}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCAN_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: input.imageBase64,
        mimeType: input.mimeType ?? 'image/jpeg',
        ...(input.cropHint ? { cropHint: input.cropHint } : {}),
      }),
      signal: controller.signal,
    });

    let body: (ScanApiSuccessBody & ScanApiErrorBody) | undefined;
    try {
      body = await response.json() as ScanApiSuccessBody & ScanApiErrorBody;
    } catch {
      body = undefined;
    }

    // Non-crop photos are a valid analysis outcome (HTTP 422 with a usable result object).
    if (response.status === 422 && body?.result) {
      return {
        result: body.result,
        source: body.source ?? 'mock',
        fallback: false,
        isCropPhoto: false,
        notCropReason: body.error,
      };
    }

    if (!response.ok) {
      const providerDown = response.status === 502 || response.status === 503 || response.status === 504;
      const quota = response.status === 429;
      return {
        result: await analyzeProduceMock(input.cropHint ?? 'Tomato', input.imageBase64),
        source: 'mock',
        fallback: true,
        error: body?.error ?? `Scan request failed (${response.status})`,
        errorKind: quota ? 'quota' : providerDown ? 'provider_unavailable' : 'request',
      };
    }

    if (!body?.result) {
      return {
        result: await analyzeProduceMock(input.cropHint ?? 'Tomato', input.imageBase64),
        source: 'mock',
        fallback: true,
        error: 'Scan response was invalid; showing demo analysis',
        errorKind: 'request',
      };
    }

    return {
      result: body.result,
      source: body.source === 'gemini' ? 'gemini' : 'mock',
      fallback: body.fallback === true,
      isCropPhoto: body.result.isCropPhoto,
      notCropReason: body.result.isCropPhoto ? undefined : body.result.notCropReason,
    };
  } catch (error) {
    const message = controller.signal.aborted
      ? `Scan timed out after ${SCAN_REQUEST_TIMEOUT_MS / 1000}s`
      : error instanceof Error ? error.message : 'Scan request failed';
    return {
      result: await analyzeProduceMock(input.cropHint ?? 'Tomato', input.imageBase64),
      source: 'mock',
      fallback: true,
      error: message,
      errorKind: 'backend_unavailable',
    };
  }
}
