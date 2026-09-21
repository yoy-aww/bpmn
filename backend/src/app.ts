import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import type { FlowableClient } from './services/flowable.js';
import { MockFlowableClient } from './services/mockFlowable.js';
import { FlowableRestClient } from './services/flowableRest.js';
import { processRouter } from './routes/process.js';
import { instanceRouter } from './routes/instance.js';
import { taskRouter } from './routes/task.js';

export function createApp(client: FlowableClient): express.Express {
  const app = express();

  app.use(
    cors({
      origin: config.allowedOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '5mb' }));

  // 健康检查
  app.get('/api/health', async (_req, res) => {
    const health = await client.health();
    res.json({ ...health, mode: config.mode, port: config.port });
  });

  // 路由
  app.use('/api/process', processRouter(client));
  app.use('/api/instance', instanceRouter(client));
  app.use('/api/task', taskRouter(client));

  // 404
  app.use((req, res) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
  });

  // 错误处理
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Error]', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  });

  return app;
}

export function createClient(): FlowableClient {
  if (config.mode === 'flowable') {
    return new FlowableRestClient();
  }
  return new MockFlowableClient();
}
