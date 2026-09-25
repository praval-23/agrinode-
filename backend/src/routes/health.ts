import { Router } from 'express';
import { getDatabaseStatus } from '../repositories';

const healthRouter = Router();

healthRouter.get('/', async (_request, response) => {
  const database = await getDatabaseStatus();
  response.json({ status: 'ok', service: 'AgriNode API', ...database });
});

export default healthRouter;