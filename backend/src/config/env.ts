import dotenv from 'dotenv';
import { resolve } from 'node:path';

// Resolve the backend environment relative to this module, not process.cwd().
// This keeps `npm --prefix backend` and root-launched commands consistent.
dotenv.config({ path: resolve(__dirname, '../../.env') });

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

export type MarketDataProviderName = 'mock' | 'government';

const marketDataProvider = process.env.MARKET_DATA_PROVIDER ?? 'mock';
const marketDataFallbackEnabled = process.env.MARKET_DATA_FALLBACK_ENABLED !== 'false';

if (marketDataProvider !== 'mock' && marketDataProvider !== 'government') {
  throw new Error('MARKET_DATA_PROVIDER must be either mock or government');
}

export const env = {
  port,
  database: {
    provider: process.env.DATABASE_PROVIDER === 'supabase' ? 'supabase' : 'local',
    url: process.env.DATABASE_URL?.trim() || undefined,
    supabaseUrl: process.env.SUPABASE_URL?.trim() || undefined,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined,
  },
  auth: {
    required: process.env.AUTH_REQUIRED === 'true',
    tokens: new Map((process.env.AUTH_TOKENS ?? '').split(',').map((entry) => entry.trim()).filter(Boolean).flatMap((entry) => {
      const separator = entry.indexOf('=');
      if (separator < 1) return [];
      const [userId, role] = entry.slice(separator + 1).split(':');
      if (!userId || (role !== 'farmer' && role !== 'buyer' && role !== 'transporter')) return [];
      return [[entry.slice(0, separator), { id: userId, role }] as const];
    })),
  },
  marketDataProvider: marketDataProvider as MarketDataProviderName,
  marketDataFallbackEnabled,
  government: {
    apiBaseUrl: (process.env.GOVERNMENT_API_BASE_URL ?? 'https://api.data.gov.in/resource').replace(/\/+$/, ''),
    apiKey: process.env.GOVERNMENT_API_KEY && process.env.GOVERNMENT_API_KEY !== 'REPLACE_WITH_YOUR_DATA_GOV_IN_API_KEY'
      ? process.env.GOVERNMENT_API_KEY.trim()
      : undefined,
    resourceId: process.env.GOVERNMENT_MARKET_RESOURCE_ID ?? '9ef84268-d588-465a-a308-a864a43d0070',
    limit: Number(process.env.GOVERNMENT_API_LIMIT ?? 100),
    maxPages: Number(process.env.GOVERNMENT_API_MAX_PAGES ?? 5),
    timeoutMs: Number(process.env.GOVERNMENT_API_TIMEOUT_MS ?? 20000),
  },
};

if (!Number.isInteger(env.government.limit) || env.government.limit < 1 || env.government.limit > 1000) {
  throw new Error('GOVERNMENT_API_LIMIT must be an integer between 1 and 1000');
}

if (!Number.isInteger(env.government.maxPages) || env.government.maxPages < 1 || env.government.maxPages > 20) {
  throw new Error('GOVERNMENT_API_MAX_PAGES must be an integer between 1 and 20');
}

if (!Number.isInteger(env.government.timeoutMs) || env.government.timeoutMs < 1000 || env.government.timeoutMs > 120000) {
  throw new Error('GOVERNMENT_API_TIMEOUT_MS must be an integer between 1000 and 120000');
}

export type ScanAiProviderName = 'gemini' | 'mock';

const scanAiProvider = process.env.SCAN_AI_PROVIDER ?? 'mock';
if (scanAiProvider !== 'gemini' && scanAiProvider !== 'mock') {
  throw new Error('SCAN_AI_PROVIDER must be either gemini or mock');
}

// Verified against Google's model list (Sept 2026): gemini-3.8-flash is the
// newest stable multimodal Flash model.
const scanAiModel = (process.env.SCAN_AI_MODEL ?? 'gemini-3.8-flash').trim();
if (!scanAiModel) {
  throw new Error('SCAN_AI_MODEL must not be empty');
}

// Keys live only in backend/.env. A placeholder value is treated as not configured.
const geminiApiKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'REPLACE_WITH_YOUR_GEMINI_API_KEY'
  ? process.env.GEMINI_API_KEY
  : undefined;

export const scanEnv = {
  provider: scanAiProvider as ScanAiProviderName,
  model: scanAiModel,
  /** When the configured provider fails, serve the honest demo analysis instead of an error. */
  fallbackEnabled: process.env.SCAN_AI_FALLBACK_ENABLED !== 'false',
  gemini: {
    apiKey: geminiApiKey,
    apiBaseUrl: (process.env.GEMINI_API_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, ''),
    timeoutMs: Number(process.env.SCAN_AI_TIMEOUT_MS ?? 30000),
    maxImageBytes: Number(process.env.SCAN_AI_MAX_IMAGE_BYTES ?? 5_000_000),
  },
};

if (!Number.isFinite(scanEnv.gemini.timeoutMs) || scanEnv.gemini.timeoutMs < 1000) {
  throw new Error('SCAN_AI_TIMEOUT_MS must be a number of at least 1000');
}

if (!Number.isInteger(scanEnv.gemini.maxImageBytes) || scanEnv.gemini.maxImageBytes < 1000) {
  throw new Error('SCAN_AI_MAX_IMAGE_BYTES must be an integer of at least 1000');
}