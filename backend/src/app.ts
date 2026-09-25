import express from 'express';
import commerceRouter from './routes/commerce';
import healthRouter from './routes/health';
import marketRouter from './routes/market';
import scanRouter from './routes/scan';

export const app = express();

// Camera captures arrive as base64 JSON bodies; give the scan route a larger limit.
// Must run BEFORE the global json parser (body-parser skips once the body is parsed).
app.use('/api/scan', express.json({ limit: '8mb' }));
app.use(express.json());
app.use('/api/health', healthRouter);
app.use('/api/market', marketRouter);
app.use('/api/scan', scanRouter);
app.use('/api', commerceRouter);

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  const isPayloadTooLarge = typeof error === 'object' && error !== null && 'type' in error && (error as { type?: string }).type === 'entity.too.large';
  if (isPayloadTooLarge) {
    response.status(413).json({ error: 'Request body is too large' });
    return;
  }
  response.status(500).json({ error: 'Internal server error' });
});