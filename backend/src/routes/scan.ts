import { Router } from 'express';
import { scanEnv } from '../config/env';
import { createScanAiProvider, MockScanProvider } from '../services/scanAiProvider';
import { ScanProviderError } from '../types/scan';

const scanRouter = Router();
const provider = createScanAiProvider();
const mockProvider = new MockScanProvider();

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
/** ~4MB base64 ≈ 3MB image, comfortably above what a downscaled camera capture produces. */
const MAX_BASE64_LENGTH = 5_600_000;
const BASE64_PATTERN = /^[A-Za-z0-9+/=]+$/;

const developmentLogging = process.env.NODE_ENV !== 'production';

function errorStatus(kind: ScanProviderError['kind']): number {
  if (kind === 'not_crop') return 422;
  if (kind === 'rate_limit') return 429;
  if (kind === 'timeout') return 504;
  if (kind === 'configuration') return 503;
  return 502;
}

scanRouter.post('/quality', async (request, response, next) => {
  try {
    const body = typeof request.body === 'object' && request.body !== null ? request.body as Record<string, unknown> : {};
    const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : undefined;
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType.toLowerCase() : 'image/jpeg';
    const cropHint = typeof body.cropHint === 'string' ? body.cropHint.trim() : undefined;

    // --- request validation: return proper HTTP errors instead of crashing ---
    if (!imageBase64) {
      response.status(400).json({ error: 'imageBase64 is required' });
      return;
    }
    if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
      response.status(415).json({ error: `Unsupported image type: ${mimeType}. Supported: ${SUPPORTED_IMAGE_TYPES.join(', ')}` });
      return;
    }
    if (imageBase64.length > MAX_BASE64_LENGTH) {
      response.status(413).json({ error: `Image is too large (max ~${Math.round((MAX_BASE64_LENGTH * 3) / 4 / 1_000_000)}MB after base64)` });
      return;
    }
    const compact = imageBase64.replace(/\s/g, '');
    if (compact.length === 0 || !BASE64_PATTERN.test(compact)) {
      response.status(400).json({ error: 'imageBase64 is not valid base64' });
      return;
    }
    const decodedBytes = Buffer.from(compact, 'base64');
    if (decodedBytes.length < 32) {
      response.status(400).json({ error: 'imageBase64 does not contain a valid image payload' });
      return;
    }
    if (cropHint && cropHint.length > 80) {
      response.status(400).json({ error: 'cropHint is too long (max 80 characters)' });
      return;
    }

    if (developmentLogging) {
      console.info('[scan] request received', {
        mimeType,
        base64Chars: compact.length,
        approxBytes: Math.round((compact.length * 3) / 4),
        cropHint: cropHint ?? null,
        provider: scanEnv.provider,
        model: scanEnv.provider === 'gemini' ? scanEnv.model : 'mock-analyzer',
      });
    }

    try {
      const analysis = await provider.analyzeImage(compact);
      response.setHeader('X-Scan-Data-Source', provider.name);
      if (developmentLogging) {
        console.info('[scan] analysis complete', {
          source: provider.name,
          isCropPhoto: analysis.isCropPhoto,
          crop: analysis.crop.name,
          grade: analysis.quality.grade,
          score: analysis.quality.score,
          issues: analysis.issues.length,
        });
      }
      response.json({ result: analysis, source: provider.name, fallback: false });
      return;
    } catch (error) {
      const isProviderError = error instanceof ScanProviderError;
      const kind = isProviderError ? error.kind : 'request';
      const message = isProviderError ? error.message : 'AI provider request failed';

      if (developmentLogging) {
        console.warn('[scan] provider failed', { kind, message });
      }

      // A rejected non-crop photo is a valid, user-facing outcome — not a fallback situation.
      if (kind === 'not_crop') {
        response.status(422).json({
          error: message,
          source: scanEnv.provider === 'gemini' ? 'gemini' : 'mock',
          fallback: false,
          result: {
            isCropPhoto: false,
            notCropReason: message,
            crop: { name: 'Unknown crop', confidence: 0 },
            quality: { grade: 'C', score: 0, confidence: 0 },
            issues: [],
            observations: [],
            scannedAt: new Date().toISOString(),
            model: scanEnv.provider === 'gemini' ? scanEnv.model : 'mock-analyzer',
          },
        });
        return;
      }

      if (!scanEnv.fallbackEnabled) {
        response.status(errorStatus(kind)).json({ error: message, source: scanEnv.provider, fallback: false });
        return;
      }

      // Explicit demo fallback: backend unavailable at the provider, quota reached, or error.
      const demo = await mockProvider.analyzeImage();
      response.setHeader('X-Scan-Data-Source', 'mock');
      response.setHeader('X-Scan-Data-Fallback', 'true');
      if (developmentLogging) {
        console.info('[scan] serving mock fallback', { kind, demoGrade: demo.quality.grade });
      }
      response.json({ result: demo, source: 'mock', fallback: true, error: message });
    }
  } catch (error) {
    next(error);
  }
});

export default scanRouter;
