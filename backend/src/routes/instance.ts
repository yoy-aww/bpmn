import { Router, type Request, type Response } from 'express';
import type { FlowableClient } from '../services/flowable.js';

export function instanceRouter(client: FlowableClient): Router {
  const router = Router();

  // POST /api/instance
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { definitionKey, businessKey, variables } = req.body;
      if (!definitionKey) {
        return res.status(400).json({ error: 'definitionKey is required' });
      }
      const inst = await client.startInstance(definitionKey, businessKey, variables);
      res.json(inst);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/instance
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const list = await client.listInstances();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/instance/:id
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const inst = await client.getInstance(req.params.id);
      if (!inst) return res.status(404).json({ error: 'Not found' });
      res.json(inst);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/instance/:id
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      await client.terminateInstance(req.params.id);
      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/instance/:id/activities - 历史活动
  router.get('/:id/activities', async (req: Request, res: Response) => {
    try {
      const activities = await client.getHistoricActivities(req.params.id);
      res.json(activities);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
