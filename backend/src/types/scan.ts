/**
 * AI scanner contract shared by the backend route and provider adapters.
 * Mirrors what the Expo app receives from POST /api/scan/quality.
 */

export type ScanIssueType = 'disease' | 'pest' | 'nutrient_deficiency' | 'quality_defect';
export type ScanSeverity = 'low' | 'medium' | 'high';
export type ScanGrade = 'A' | 'B' | 'C';
export type ScanSource = 'gemini' | 'mock';

export type ScanIssue = {
  type: ScanIssueType;
  name: string;
  severity: ScanSeverity;
  /** 0-100, clamped by the provider adapter. */
  confidence: number;
  description: string;
  /** Cautious guidance only — never dosages or guaranteed diagnosis. */
  treatment: string;
};

export type ScanAnalysis = {
  isCropPhoto: boolean;
  /** Present when isCropPhoto is false so the UI can explain the rejection. */
  notCropReason?: string;
  crop: {
    name: string;
    scientificName?: string;
    /** 0-100. */
    confidence: number;
  };
  quality: {
    grade: ScanGrade;
    /** 0-100. */
    score: number;
    /** 0-100. */
    confidence: number;
  };
  issues: ScanIssue[];
  observations: string[];
  recommendedPriceMultiplier?: number;
  scannedAt: string;
  model: string;
};

export type ScanProviderResponse = {
  analysis: ScanAnalysis;
  source: ScanSource;
  fallback: boolean;
};

export class ScanProviderError extends Error {
  constructor(
    public readonly kind: 'configuration' | 'timeout' | 'rate_limit' | 'invalid_response' | 'not_crop' | 'request',
    message: string,
  ) {
    super(message);
    this.name = 'ScanProviderError';
  }
}
