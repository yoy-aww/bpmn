import { Router, type Request, type Response } from 'express';
import type { FlowableClient } from '../services/flowable.js';

export function processRouter(client: FlowableClient): Router {
  const router = Router();

  // POST /api/process/deploy
  router.post('/deploy', async (req: Request, res: Response) => {
    try {
      const { xml, name } = req.body;
      if (!xml || !name) {
        return res.status(400).json({ error: 'xml and name are required' });
      }
      const def = await client.deploy(xml, name);
      res.json(def);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/process/definitions
  router.get('/definitions', async (_req: Request, res: Response) => {
    try {
      const list = await client.listDefinitions();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/process/definitions/:id
  router.get('/definitions/:id', async (req: Request, res: Response) => {
    try {
      const def = await client.getDefinition(req.params.id);
      if (!def) return res.status(404).json({ error: 'Not found' });
      res.json(def);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
