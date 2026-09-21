import { config } from './config.js';
import { createApp, createClient } from './app.js';

const client = createClient();
const app = createApp(client);

app.listen(config.port, () => {
  console.log('='.repeat(60));
  console.log(`BPMN 后端启动`);
  console.log(`模式: ${config.mode === 'mock' ? '🧪 Mock (内存)' : '⚙️  Flowable 引擎'}`);
  console.log(`端口: ${config.port}`);
  console.log(`API:  http://localhost:${config.port}/api`);
  console.log(`健康: http://localhost:${config.port}/api/health`);
  console.log('='.repeat(60));
});
