import { Router, type Request, type Response } from 'express';
import type { FlowableClient } from '../services/flowable.js';

export function taskRouter(client: FlowableClient): Router {
  const router = Router();

  // GET /api/task
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { processInstanceId, assignee } = req.query;
      const tasks = await client.listTasks({
        processInstanceId: processInstanceId as string | undefined,
        assignee: assignee as string | undefined,
      });
      res.json(tasks);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/task/:id
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const task = await client.getTask(req.params.id);
      if (!task) return res.status(404).json({ error: 'Not found' });
      res.json(task);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/task/:id/complete
  router.post('/:id/complete', async (req: Request, res: Response) => {
    try {
      const { variables } = req.body;
      await client.completeTask(req.params.id, variables);
      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/task/:id/assignee
  router.put('/:id/assignee', async (req: Request, res: Response) => {
    try {
      const { assignee } = req.body;
      if (!assignee) {
        return res.status(400).json({ error: 'assignee is required' });
      }
      await client.assignTask(req.params.id, assignee);
      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/task/:id/comment
  router.post('/:id/comment', async (req: Request, res: Response) => {
    try {
      const { userId, message } = req.body;
      if (!userId || !message) {
        return res.status(400).json({ error: 'userId and message are required' });
      }
      const comment = await client.addComment(req.params.id, userId, message);
      res.json(comment);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/task/:id/comments
  router.get('/:id/comments', async (req: Request, res: Response) => {
    try {
      const comments = await client.listComments(req.params.id);
      res.json(comments);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
