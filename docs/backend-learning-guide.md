# BPMN 工作流后端 - 学习文档

本文档专注于后端部分（`backend/` + `infra/`），从目录结构、技术选型、每个文件的作用、核心设计模式、Mock 与 Flowable 双实现、REST API 设计到调试技巧，逐层拆解。

---

## 一、目录结构

```
backend/
├── .env                   # 环境变量（运行时配置，已 gitignore）
├── .env.example           # 环境变量模板
├── .gitignore             # 忽略 node_modules / dist / .env
├── package.json           # 依赖与脚本
├── tsconfig.json          # TypeScript 配置
└── src/
    ├── index.ts           # 应用启动入口
    ├── app.ts             # Express 应用工厂 + FlowableClient 工厂
    ├── config.ts          # 环境变量配置
    ├── types.ts           # 全局类型定义
    ├── routes/
    │   ├── process.ts     # 流程定义路由
    │   ├── instance.ts    # 流程实例路由
    │   └── task.ts        # 任务路由
    └── services/
        ├── flowable.ts       # FlowableClient 接口定义
        ├── mockFlowable.ts   # 内存 Mock 实现
        └── flowableRest.ts   # Flowable REST API 实现

infra/                     # Flowable 引擎基础设施（可选）
└── flowable-app/
    ├── pom.xml            # Maven 依赖配置
    ├── Dockerfile         # 多阶段构建
    └── src/main/
        ├── java/com/bpmn/demo/
        │   └── FlowableApplication.java   # Spring Boot 入口
        └── resources/
            └── application.yml            # Flowable 配置
```

**分层职责**：

| 层 | 目录 | 职责 |
|---|---|---|
| 入口 | `index.ts` | 创建 Client + App，启动 HTTP 服务 |
| 配置 | `config.ts` + `.env` | 读取环境变量，集中管理配置 |
| 路由 | `routes/` | 接收 HTTP 请求，参数校验，调用 Service |
| 服务 | `services/` | 业务逻辑实现，与流程引擎交互 |
| 类型 | `types.ts` | 数据契约，前后端共享 |
| 基础设施 | `infra/` | Flowable Spring Boot 应用 + Docker |

---

## 二、技术选型与配置

### 2.1 核心依赖

| 包名 | 版本 | 用途 |
|---|---|---|
| `express` | 4.19+ | HTTP 框架 |
| `cors` | 2.8+ | 跨域中间件 |
| `dotenv` | 16.4+ | 从 `.env` 文件加载环境变量 |
| `node-fetch` | 3.3+ | HTTP 客户端（调用 Flowable REST API） |
| `uuid` | 9.0+ | 生成唯一 ID（Mock 模式） |
| `tsx` | 4.16+ (dev) | TypeScript 执行器，支持 watch 模式 |
| `typescript` | 5.5+ (dev) | 类型系统 |

**为什么不选 Camunda/Activiti 的 Node SDK？** 这些引擎没有官方 Node.js SDK，只有 Java SDK。本项目选择 REST API 通信，语言无关，调试方便（curl 即可）。

### 2.2 npm scripts

```json
{
  "dev": "tsx watch src/index.ts",      // 开发模式，文件变更自动重启
  "build": "tsc -p tsconfig.json",      // 编译 TypeScript 到 dist/
  "start": "node dist/index.js",        // 生产模式，运行编译产物
  "typecheck": "tsc --noEmit"           // 仅类型检查，不输出文件
}
```

**`tsx`** 是 `ts-node` 的替代品，基于 esbuild，启动速度更快。`tsx watch` 监听文件变更自动重启进程。

### 2.3 TypeScript 配置

```json
{
  "compilerOptions": {
    "target": "ES2022",              // 编译目标
    "module": "ESNext",              // ESM 模块
    "moduleResolution": "Bundler",   // Vite/tsx 场景的模块解析
    "outDir": "./dist",              // 编译输出目录
    "rootDir": "./src",              // 源码根目录
    "strict": true,                  // 严格模式
    "declaration": true,             // 生成 .d.ts 声明文件
    "sourceMap": true                // 生成 source map，便于调试
  }
}
```

注意：开发时用 `tsx` 直接运行 `.ts` 文件，不需要先编译。`build` 脚本用于生产部署。

### 2.4 环境变量

文件：`.env` / `.env.example`

```bash
# ── 运行模式 ──
MODE=mock                        # mock | flowable

# ── Flowable 连接（MODE=flowable 时生效）──
FLOWABLE_URL=http://localhost:8080
FLOWABLE_USER=flowable
FLOWABLE_PASSWORD=***

# ── MySQL（Docker Compose 使用，后端本身不直连）──
DB_URL=jdbc:mysql://mysql:3306/flowable
DB_USERNAME=flowable
DB_PASSWORD=***

# ── 服务器 ──
PORT=3000

# ── CORS ──
ALLOWED_ORIGINS=http://localhost:5173
```

`.env` 文件通过 `dotenv` 包在 `config.ts` 中加载：

```typescript
import 'dotenv/config';   // 顶部导入，自动读取 .env
```

> **注意**：`.env` 在 `.gitignore` 中，不会提交到仓库。`.env.example` 是模板，新开发者复制后修改。

---

## 三、配置模块

文件：`src/config.ts`

```typescript
import 'dotenv/config';

export const config = {
  mode: (process.env.MODE || 'mock') as 'mock' | 'flowable',
  port: Number(process.env.PORT || 3000),
  flowable: {
    url: process.env.FLOWABLE_URL || 'http://localhost:8080',
    user: process.env.FLOWABLE_USER || 'flowable',
    password: process.env.FLOWABLE_PASSWORD || 'flowable',
  },
  db: {
    url: process.env.DB_URL || '',
    username: process.env.DB_USERNAME || '',
    password: process.env.DB_PASSWORD || '',
  },
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5174')
    .split(',')
    .map(s => s.trim()),
};
```

**设计要点**：
- 每个配置项都有默认值，不设 `.env` 也能运行
- `allowedOrigins` 支持逗号分隔的多个域名
- `db` 配置仅用于 Docker Compose 环境变量透传，后端 Node.js 本身不直连 MySQL
- `mode` 类型断言为联合类型 `'mock' | 'flowable'`，提供类型安全

---

## 四、类型定义

文件：`src/types.ts`

定义了前后端共享的数据契约，与前端 `frontend/src/types/bpmn.ts` 保持一致。

```typescript
// ─── 流程定义 ───
export interface ProcessDefinition {
  id: string;                  // 定义 ID（如 "def-1700000000"）
  key: string;                 // 流程 Key（如 "leave_request"，来自 BPMN XML 的 <process id>）
  name: string;                // 流程名称（如 "请假申请流程"）
  version: number;             // 版本号（每次部署递增）
  deploymentId: string;        // 部署 ID
  resourceName: string;        // 资源文件名
  diagramId?: string;          // 流程图 ID（Flowable 模式）
  xml: string;                 // BPMN XML 内容
  deployedAt: string;          // 部署时间
}

// ─── 流程实例 ───
export interface ProcessInstance {
  id: string;
  processDefinitionId: string;
  processDefinitionKey: string;
  businessKey?: string;            // 业务标识（如 "ORDER-2024-001"）
  name?: string;
  variables: Record<string, any>;  // 流程变量
  startTime: string;
  endTime?: string;                // 有值 = 已结束
  state: 'ACTIVE' | 'COMPLETED' | 'TERMINATED' | 'SUSPENDED';
  currentActivityIds?: string[];   // 当前正在执行的活动节点
}

// ─── 用户任务 ───
export interface UserTask {
  id: string;
  name: string;                    // 任务名称（如 "经理审批"）
  processInstanceId: string;
  processDefinitionKey: string;
  taskDefinitionKey: string;       // BPMN 中定义的 ID（如 "Task_MgrApproval"）
  assignee?: string;               // 负责人
  owner?: string;
  candidateGroups?: string[];      // 候选组
  priority: number;
  createTime: string;
  dueDate?: string;
  formKey?: string;                // 表单 Key（动态表单用）
  variables: Record<string, any>;
  description?: string;
}

// ─── 任务评论 ───
export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  message: string;
  created: string;
  type: 'comment' | 'event';
}

// ─── 历史活动实例 ───
export interface HistoricActivityInstance {
  id: string;
  processInstanceId: string;
  activityId: string;              // 活动 ID（对应 BPMN 元素 ID）
  activityName: string;
  activityType: string;            // startEvent / userTask / exclusiveGateway / endEvent / ...
  taskDefinitionKey?: string;
  startTime: string;
  endTime?: string;                // 有值 = 已完成，无值 = 进行中
  duration?: number;
  state: 'ACTIVE' | 'COMPLETED';
}
```

**类型流转**：

```
前端 api.ts ──→ 后端 routes ──→ services ──→ 返回类型化数据 ──→ 前端接收
     ↑                                                              │
     └──────────── 前后端类型定义一致 ←─────────────────────────────┘
```

---

## 五、应用入口与工厂

### 5.1 入口

文件：`src/index.ts`

```typescript
import { config } from './config.js';
import { createApp, createClient } from './app.js';

const client = createClient();      // 1. 创建 FlowableClient（根据 MODE）
const app = createApp(client);      // 2. 创建 Express 应用，注入 Client

app.listen(config.port, () => {
  console.log('='.repeat(60));
  console.log(`BPMN 后端启动`);
  console.log(`模式: ${config.mode === 'mock' ? '🧪 Mock (内存)' : '⚙️  Flowable 引擎'}`);
  console.log(`端口: ${config.port}`);
  console.log(`API:  http://localhost:${config.port}/api`);
  console.log('='.repeat(60));
});
```

**关键设计**：Client 和 App 分离创建，便于测试（可以传入 Mock Client）。

### 5.2 应用工厂

文件：`src/app.ts`

```typescript
export function createApp(client: FlowableClient): express.Express {
  const app = express();

  // ── 中间件 ──
  app.use(cors({ origin: config.allowedOrigins, credentials: true }));
  app.use(express.json({ limit: '5mb' }));   // 支持 BPMN XML（可能很大）

  // ── 健康检查 ──
  app.get('/api/health', async (_req, res) => {
    const health = await client.health();
    res.json({ ...health, mode: config.mode, port: config.port });
  });

  // ── 业务路由 ──
  app.use('/api/process', processRouter(client));
  app.use('/api/instance', instanceRouter(client));
  app.use('/api/task', taskRouter(client));

  // ── 404 ──
  app.use((req, res) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
  });

  // ── 全局错误处理 ──
  app.use((err: any, _req, res, _next) => {
    console.error('[Error]', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  });

  return app;
}
```

**中间件链**：

```
请求 → cors → json解析 → 路由匹配 → 404 → 错误处理 → 响应
```

**`express.json({ limit: '5mb' })`**：默认 body 大小限制是 100kb，BPMN XML 可能包含大量图形坐标数据，5mb 足够覆盖。

### 5.3 Client 工厂

```typescript
export function createClient(): FlowableClient {
  if (config.mode === 'flowable') {
    return new FlowableRestClient();
  }
  return new MockFlowableClient();
}
```

**策略模式** 的入口：根据 `MODE` 环境变量决定使用哪个实现。路由层完全不知道底层用的是 Mock 还是真实引擎。

---

## 六、FlowableClient 接口 —— 双模式的核心

文件：`src/services/flowable.ts`

```typescript
export interface FlowableClient {
  // ── 部署 ──
  deploy(xml: string, name: string): Promise<ProcessDefinition>;
  listDefinitions(): Promise<ProcessDefinition[]>;
  getDefinition(id: string): Promise<ProcessDefinition | null>;

  // ── 流程实例 ──
  startInstance(
    definitionKey: string,
    businessKey?: string,
    variables?: Record<string, any>,
  ): Promise<ProcessInstance>;
  listInstances(): Promise<ProcessInstance[]>;
  getInstance(id: string): Promise<ProcessInstance | null>;
  terminateInstance(id: string): Promise<void>;

  // ── 任务 ──
  listTasks(opts?: {
    processInstanceId?: string;
    assignee?: string;
  }): Promise<UserTask[]>;
  getTask(id: string): Promise<UserTask | null>;
  completeTask(id: string, variables?: Record<string, any>): Promise<void>;
  assignTask(id: string, assignee: string): Promise<void>;

  // ── 评论 ──
  addComment(taskId: string, userId: string, message: string): Promise<TaskComment>;
  listComments(taskId: string): Promise<TaskComment[]>;

  // ── 历史 ──
  getHistoricActivities(processInstanceId: string): Promise<HistoricActivityInstance[]>;

  // ── 健康检查 ──
  health(): Promise<{ ok: boolean; engine: string }>;
}
```

**接口设计原则**：
- 方法名语义化，不暴露底层引擎的 API 路径
- 返回类型统一使用项目自定义类型（`ProcessDefinition` 等），而非 Flowable 原始类型
- `null` 表示未找到（`getDefinition` / `getInstance` / `getTask`），而非抛异常
- `health()` 用于前端健康检查指示灯

---

## 七、MockFlowableClient —— 内存实现

文件：`src/services/mockFlowable.ts`

### 7.1 数据存储

```typescript
export class MockFlowableClient implements FlowableClient {
  private definitions = new Map<string, ProcessDefinition>();          // 流程定义
  private instances   = new Map<string, ProcessInstance>();            // 流程实例
  private tasks       = new Map<string, UserTask>();                   // 用户任务
  private comments    = new Map<string, TaskComment[]>();             // 评论（按 taskId 索引）
  private activities  = new Map<string, HistoricActivityInstance[]>(); // 历史活动（按 instanceId 索引）
  private deployCounter = 0;                                           // 版本号计数器
}
```

所有数据存在进程内存中，重启即丢失。

### 7.2 核心方法详解

#### `deploy()` —— 部署流程定义

```typescript
async deploy(xml: string, name: string): Promise<ProcessDefinition> {
  this.deployCounter++;
  const defId = `def-${Date.now()}`;
  const def: ProcessDefinition = {
    id: defId,
    key: this.extractProcessKey(xml) || name,   // 从 XML 提取 <process id>
    name,
    version: this.deployCounter,
    deploymentId: `deploy-${Date.now()}`,
    resourceName: `${name}.bpmn`,
    xml,                                         // 保存原始 XML
    deployedAt: new Date().toISOString(),
  };
  this.definitions.set(defId, def);
  return def;
}
```

**`extractProcessKey()`** —— 用正则从 XML 中提取流程 Key：

```typescript
private extractProcessKey(xml: string): string | null {
  const match = xml.match(/<bpmn:process\s+id="([^"]+)"/);
  return match?.[1] || null;
}
```

例如 `<bpmn:process id="leave_request">` 会提取出 `leave_request`。

#### `startInstance()` —— 启动流程实例

```typescript
async startInstance(definitionKey, businessKey?, variables?): Promise<ProcessInstance> {
  // 1. 找到匹配的流程定义
  const def = Array.from(this.definitions.values()).find(d => d.key === definitionKey);
  if (!def) throw new Error(`未找到流程定义: ${definitionKey}`);

  // 2. 创建实例
  const instance: ProcessInstance = {
    id: randomUUID(),
    processDefinitionId: def.id,
    processDefinitionKey: def.key,
    businessKey,
    name: def.name,
    variables: variables || {},
    startTime: new Date().toISOString(),
    state: 'ACTIVE',
    currentActivityIds: this.extractStartEvents(def.xml),
  };
  this.instances.set(instance.id, instance);

  // 3. 创建初始历史活动（startEvent）
  this.activities.set(instance.id, [{
    id: randomUUID(),
    processInstanceId: instance.id,
    activityId: 'StartEvent_1',
    activityName: '开始',
    activityType: 'startEvent',
    startTime: instance.startTime,
    state: 'COMPLETED',
  }]);

  return instance;
}
```

#### `completeTask()` —— 完成任务（最复杂的方法）

```typescript
async completeTask(id: string, variables?: Record<string, any>): Promise<void> {
  const task = this.tasks.get(id);
  if (!task) throw new Error(`任务不存在: ${id}`);

  // 1. 合并变量到任务和实例
  if (variables) {
    Object.assign(task.variables, variables);
    const inst = this.instances.get(task.processInstanceId);
    if (inst) Object.assign(inst.variables, variables);
  }

  // 2. 移除任务
  this.tasks.delete(id);

  // 3. 记录历史活动
  const acts = this.activities.get(task.processInstanceId) || [];
  acts.push({
    id: randomUUID(),
    processInstanceId: task.processInstanceId,
    activityId: task.taskDefinitionKey,
    activityName: task.name,
    activityType: 'userTask',
    taskDefinitionKey: task.taskDefinitionKey,
    startTime: task.createTime,
    endTime: new Date().toISOString(),
    state: 'COMPLETED',
  });
  this.activities.set(task.processInstanceId, acts);

  // 4. 检查实例是否还有任务，没有则完成实例
  const remainingTasks = Array.from(this.tasks.values())
    .filter(t => t.processInstanceId === task.processInstanceId);
  if (remainingTasks.length === 0) {
    const inst = this.instances.get(task.processInstanceId);
    if (inst) {
      inst.state = 'COMPLETED';
      inst.endTime = new Date().toISOString();
      // 记录 endEvent
      acts.push({
        id: randomUUID(),
        processInstanceId: inst.id,
        activityId: 'EndEvent_1',
        activityName: '结束',
        activityType: 'endEvent',
        startTime: inst.endTime,
        endTime: inst.endTime,
        state: 'COMPLETED',
      });
    }
  }
}
```

**流转逻辑**：
1. 合并变量 → 2. 删除任务 → 3. 写入历史 → 4. 检查是否所有任务完成

> **Mock 的局限**：Mock 不会根据 BPMN XML 自动生成新任务和走网关分支。它只做简单的"任务全完成则实例完成"判断。要体验完整的网关分支流转，需切换到 Flowable 模式。

#### `injectTask()` —— 测试辅助方法

```typescript
async injectTask(instanceId: string, task: Partial<UserTask> & { name: string; taskDefinitionKey: string }): Promise<UserTask> {
  const newTask: UserTask = {
    id: randomUUID(),
    name: task.name,
    processInstanceId: instanceId,
    processDefinitionKey: 'unknown',
    taskDefinitionKey: task.taskDefinitionKey,
    priority: 50,
    createTime: new Date().toISOString(),
    variables: {},
  };
  Object.assign(newTask, task);  // 允许覆盖 assignee 等字段
  this.tasks.set(newTask.id, newTask);
  return newTask;
}
```

这是 `FlowableClient` 接口之外的方法，仅在 Mock 实现中存在。用于手动向实例注入任务，方便测试。

---

## 八、FlowableRestClient —— 真实引擎实现

文件：`src/services/flowableRest.ts`

### 8.1 初始化与认证

```typescript
export class FlowableRestClient implements FlowableClient {
  private baseUrl: string;
  private auth: string;

  constructor() {
    this.baseUrl = config.flowable.url.replace(/\/$/, '');  // 去除尾部斜杠
    // Basic Auth：Base64 编码 "user:password"
    this.auth = Buffer.from(
      `${config.flowable.user}:${config.flowable.password}`,
    ).toString('base64');
  }
}
```

**Basic Auth 原理**：Flowable REST API 默认启用 Basic 认证。每次请求携带 `Authorization: Basic <base64(user:password)>` 头。

### 8.2 通用请求方法

```typescript
private async request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: any,
): Promise<T> {
  const url = `${this.baseUrl}${path}`;
  const resp = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${this.auth}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Flowable ${resp.status}: ${text}`);
  }
  return (await resp.json()) as T;
}
```

**设计要点**：
- 统一错误处理：`!resp.ok` 时抛异常，包含 HTTP 状态码和响应体
- 泛型 `<T>` 让调用方指定返回类型
- 仅处理 JSON 请求体（`deploy` 例外，需要 multipart）

### 8.3 Flowable REST API 映射

| 本项目方法 | HTTP | Flowable REST API | 说明 |
|---|---|---|---|
| `deploy()` | POST | `/repository/deployments` | multipart 上传 XML |
| `listDefinitions()` | GET | `/repository/process-definitions?latest=true` | 最新版本 |
| `getDefinition()` | GET | `/repository/process-definitions/:id` | 单个定义 |
| `startInstance()` | POST | `/runtime/process-instances` | 启动实例 |
| `listInstances()` | GET | `/runtime/process-instances` | 运行中实例 |
| `getInstance()` | GET | `/runtime/process-instances/:id` | 单个实例 |
| `terminateInstance()` | DELETE | `/runtime/process-instances/:id` | 终止实例 |
| `listTasks()` | GET | `/task` | 查询参数筛选 |
| `completeTask()` | POST | `/task/:id/complete` | 传 variables |
| `assignTask()` | PUT | `/task/:id/assignee` | 传 userId |
| `addComment()` | POST | `/task/:id/comment` | 传 userId + message |
| `listComments()` | GET | `/task/:id/comment` | 评论列表 |
| `getHistoricActivities()` | GET | `/history/activity-instances` | 历史活动 |
| `health()` | GET | `/repository/deployments` | 探测引擎是否在线 |

### 8.4 deploy() —— 特殊的 multipart 请求

`deploy` 是唯一不走 `request<T>()` 通用方法的方法，因为 Flowable 部署接口要求 `multipart/form-data`：

```typescript
async deploy(xml: string, name: string): Promise<ProcessDefinition> {
  // 1. 构造 FormData
  const fd = new FormData();
  fd.append('filesToDeploy', new Blob([xml], { type: 'text/xml' }), 'process.bpmn');

  // 2. 发送 multipart 请求
  const resp = await fetch(`${this.baseUrl}/repository/deployments`, {
    method: 'POST',
    headers: { Authorization: `Basic ${this.auth}` },
    body: fd,   // 注意：不能设 Content-Type，浏览器自动设 boundary
  });

  // 3. 从部署结果中获取流程定义
  const deployment = await resp.json();
  const defs = await this.request<any[]>(
    'GET',
    `/repository/deployments/${deployment.id}/process-definitions`,
  );

  // 4. 映射为项目类型
  return this.mapDefinition(defs[0], xml);
}
```

### 8.5 数据映射方法

Flowable 返回的 JSON 字段名与本项目类型不完全一致，三个映射方法负责转换：

```typescript
private mapDefinition(def: any, xml?: string): ProcessDefinition {
  return {
    id: def.id,
    key: def.key,
    name: def.name,
    version: def.version,
    deploymentId: def.deploymentId,
    resourceName: def.resourceName,
    diagramId: def.diagramId,
    xml: xml || '',    // deploy 时传入，其他时候为空
    deployedAt: def.deploymentTime
      ? new Date(def.deploymentTime).toISOString()
      : new Date().toISOString(),
  };
}

private mapInstance(inst: any): ProcessInstance {
  return {
    id: inst.id,
    processDefinitionId: inst.processDefinitionId,
    processDefinitionKey: inst.processDefinitionKey,
    businessKey: inst.businessKey,
    name: inst.name,
    variables: inst.variables || {},
    startTime: inst.startTime,
    endTime: inst.endTime,
    state: inst.endTime ? 'COMPLETED' : 'ACTIVE',   // Flowable 用 endTime 判断
  };
}

private mapTask(t: any): UserTask {
  return {
    id: t.id,
    name: t.name,
    processInstanceId: t.processInstanceId,
    processDefinitionKey: t.processDefinitionKey,
    taskDefinitionKey: t.taskDefinitionKey,
    assignee: t.assignee,
    owner: t.owner,
    candidateGroups: t.candidateGroups,
    priority: t.priority ?? 50,
    createTime: t.createTime,
    dueDate: t.dueDate,
    formKey: t.formKey,
    variables: t.variables || {},
    description: t.description,
  };
}
```

**为什么需要映射？**
- 解耦：前端不依赖 Flowable 的字段命名
- 裁剪：只暴露项目需要的字段
- 适配：不同引擎（Camunda/Activiti）的字段名可能不同

---

## 九、路由层

路由层是 HTTP 请求与业务逻辑之间的桥梁，职责：**参数校验 → 调用 Service → 返回响应**。

### 9.1 路由工厂模式

所有路由都使用工厂函数，接收 `FlowableClient` 参数：

```typescript
export function processRouter(client: FlowableClient): Router {
  const router = Router();
  // ... 定义路由
  return router;
}
```

**好处**：
- 依赖注入，路由不关心底层实现
- 便于单元测试（传入 Mock Client）

### 9.2 process.ts —— 流程定义路由

| 方法 | 路径 | 功能 | 参数 |
|---|---|---|---|
| POST | `/api/process/deploy` | 部署流程 | `{ xml, name }` |
| GET | `/api/process/definitions` | 列表 | - |
| GET | `/api/process/definitions/:id` | 详情 | 路径参数 `id` |

```typescript
router.post('/deploy', async (req, res) => {
  const { xml, name } = req.body;
  if (!xml || !name) {
    return res.status(400).json({ error: 'xml and name are required' });
  }
  const def = await client.deploy(xml, name);
  res.json(def);
});
```

**参数校验**：缺少 `xml` 或 `name` 返回 400。注意用 `return` 防止后续代码执行。

### 9.3 instance.ts —— 流程实例路由

| 方法 | 路径 | 功能 | 参数 |
|---|---|---|---|
| POST | `/api/instance` | 启动实例 | `{ definitionKey, businessKey?, variables? }` |
| GET | `/api/instance` | 列表 | - |
| GET | `/api/instance/:id` | 详情 | 路径参数 `id` |
| DELETE | `/api/instance/:id` | 终止 | 路径参数 `id` |
| GET | `/api/instance/:id/activities` | 历史活动 | 路径参数 `id` |

```typescript
router.post('/', async (req, res) => {
  const { definitionKey, businessKey, variables } = req.body;
  if (!definitionKey) {
    return res.status(400).json({ error: 'definitionKey is required' });
  }
  const inst = await client.startInstance(definitionKey, businessKey, variables);
  res.json(inst);
});

router.delete('/:id', async (req, res) => {
  await client.terminateInstance(req.params.id);
  res.status(204).end();   // 204 No Content
});
```

**HTTP 状态码选择**：
- `200` + JSON body —— 查询/创建成功
- `204` + 空 body —— 删除/操作成功无返回内容
- `400` —— 参数校验失败
- `404` —— 资源不存在
- `500` —— 服务端错误

### 9.4 task.ts —— 任务路由

| 方法 | 路径 | 功能 | 参数 |
|---|---|---|---|
| GET | `/api/task` | 任务列表 | query: `processInstanceId`, `assignee` |
| GET | `/api/task/:id` | 详情 | 路径参数 `id` |
| POST | `/api/task/:id/complete` | 完成任务 | `{ variables? }` |
| PUT | `/api/task/:id/assignee` | 指派 | `{ assignee }` |
| POST | `/api/task/:id/comment` | 添加评论 | `{ userId, message }` |
| GET | `/api/task/:id/comments` | 评论列表 | 路径参数 `id` |

**查询参数处理**：

```typescript
router.get('/', async (req, res) => {
  const { processInstanceId, assignee } = req.query;
  const tasks = await client.listTasks({
    processInstanceId: processInstanceId as string | undefined,
    assignee: assignee as string | undefined,
  });
  res.json(tasks);
});
```

`req.query` 的值是 `string | QueryString.ParsedQs`，需要类型断言为 `string`。

**HTTP 方法语义**：
- `POST` —— 创建资源或执行操作（complete、comment）
- `PUT` —— 更新资源（assignee）
- `GET` —— 查询

---

## 十、中间件链与错误处理

### 10.1 中间件执行顺序

```
请求
 │
 ▼
cors()              → 处理跨域，检查 Origin 头
 │
 ▼
express.json()      → 解析请求体为 req.body
 │
 ▼
路由匹配            → /api/process, /api/instance, /api/task
 │
 ▼
路由处理函数         → 业务逻辑
 │
 ▼
404 中间件           → 没有匹配的路由时触发
 │
 ▼
错误处理中间件       → 4 个参数 (err, req, res, next)
 │
 ▼
响应
```

### 10.2 错误处理策略

**路由层**使用 `try/catch`：

```typescript
router.post('/deploy', async (req, res) => {
  try {
    const def = await client.deploy(xml, name);
    res.json(def);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

**全局错误处理**捕获未处理的异常：

```typescript
app.use((err: any, _req, res, _next) => {
  console.error('[Error]', err);
  res.status(500).json({ error: err.message || 'Internal error' });
});
```

**错误响应格式统一**：`{ error: string }`，前端可以直接显示 `error.message`。

---

## 十一、基础设施 —— Flowable Spring Boot 应用

### 11.1 Spring Boot 入口

文件：`infra/flowable-app/src/main/java/com/bpmn/demo/FlowableApplication.java`

```java
@SpringBootApplication
public class FlowableApplication {
    public static void main(String[] args) {
        SpringApplication.run(FlowableApplication.class, args);
    }
}
```

极简入口，`@SpringBootApplication` 开启自动配置，包含：
- 组件扫描（当前包及子包）
- 自动配置（`flowable-spring-boot-starter` 自动注册引擎 Bean）
- 配置属性绑定

### 11.2 application.yml 配置

文件：`infra/flowable-app/src/main/resources/application.yml`

```yaml
server:
  port: 8080

spring:
  datasource:
    # 优先使用环境变量，无则降级到 H2 内存数据库
    url: ${DB_URL:jdbc:h2:mem:flowable;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE}
    username: ${DB_USERNAME:sa}
    password: ${DB_PASSWORD:}
    driver-class-name: ${DB_DRIVER:org.h2.Driver}
  h2:
    console:
      enabled: true          # 启用 H2 控制台（本地调试用）
      path: /h2-console

flowable:
  rest:
    enabled: true            # 启用 REST API
  database:
    schema-update: true      # 自动创建/更新数据库表
  event-reregister: false    # 禁用事件重注册（加快启动速度）

management:
  endpoints:
    web:
      exposure:
        include: health,info   # 暴露健康检查端点
  endpoint:
    health:
      show-details: always
```

**双数据库支持**：
- **Docker 模式**：通过环境变量 `DB_URL` 指向 MySQL
- **本地模式**：默认使用 H2 内存数据库，开箱即用

### 11.3 Maven 依赖

文件：`infra/flowable-app/pom.xml`

| 依赖 | 版本 | 用途 |
|---|---|---|
| `flowable-spring-boot-starter` | 6.8.1 | Flowable 核心引擎 + Spring Boot 自动配置 |
| `flowable-rest` | 6.8.1 | REST API 模块（提供 `/repository`、`/runtime`、`/task` 等端点） |
| `spring-boot-starter-actuator` | Spring Boot 内置 | 健康检查（`/actuator/health`） |
| `mysql-connector-j` | Spring Boot 内置 | MySQL 驱动 |
| `h2` | Spring Boot 内置 | 内存数据库（本地测试） |

### 11.4 Dockerfile —— 多阶段构建

文件：`infra/flowable-app/Dockerfile`

```dockerfile
# 阶段 1：编译
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B      # 先下载依赖（利用 Docker 缓存层）
COPY src ./src
RUN mvn package -DskipTests -B        # 编译打包

# 阶段 2：运行
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
RUN apk add --no-cache curl           # 安装 curl（健康检查用）
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

**多阶段构建的好处**：
- 最终镜像不含 Maven 和源码，体积小（~200MB vs ~800MB）
- 依赖下载层独立缓存，pom.xml 不变时不重新下载

### 11.5 Docker Compose 编排

文件：`docker-compose.yml`

```yaml
services:
  flowable:
    build: ./infra/flowable-app
    ports: ["8080:8080"]
    environment:
      - DB_URL=jdbc:mysql://mysql:3306/flowable?...
      - DB_USERNAME=flowable
      - DB_PASSWORD=***
      - DB_DRIVER=com.mysql.cj.jdbc.Driver
    depends_on:
      mysql:
        condition: service_healthy     # MySQL 健康后才启动 Flowable
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
      interval: 10s
      retries: 10

  mysql:
    image: mysql:8.0
    ports: ["3306:3306"]
    environment:
      - MYSQL_ROOT_PASSWORD=***
      - MYSQL_DATABASE=flowable
      - MYSQL_USER=flowable
      - MYSQL_PASSWORD=***
    volumes:
      - mysql_data:/var/lib/mysql     # 数据持久化
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
```

**启动顺序**：MySQL 健康检查通过 → Flowable 启动 → Flowable 健康检查通过 → 后端可连接

---

## 十二、核心设计模式总结

### 12.1 策略模式（Strategy Pattern）

```
FlowableClient (接口)
  ├── MockFlowableClient    → 内存 Map，零依赖
  └── FlowableRestClient    → Flowable REST API
```

切换方式：修改 `MODE` 环境变量，重启即可。路由层和前端完全无感知。

**扩展性**：如需接入 Camunda 8，只需新增 `Camunda8Client implements FlowableClient`，修改 `createClient()` 即可。

### 12.2 工厂模式（Factory Pattern）

```typescript
export function createClient(): FlowableClient {
  if (config.mode === 'flowable') return new FlowableRestClient();
  return new MockFlowableClient();
}
```

集中了实例创建逻辑，调用方不需要 `new`。

### 12.3 依赖注入（Dependency Injection）

路由通过参数注入 Client：

```typescript
export function processRouter(client: FlowableClient): Router { ... }
export function instanceRouter(client: FlowableClient): Router { ... }
export function taskRouter(client: FlowableClient): Router { ... }
```

好处：
- 路由不关心 Client 的具体实现
- 测试时可以传入自定义 Mock

### 12.4 适配器模式（Adapter Pattern）

`FlowableRestClient` 中的 `mapDefinition()`、`mapInstance()`、`mapTask()` 方法将 Flowable 的数据格式适配为项目的统一类型。这是典型的适配器模式。

### 12.5 关注点分离（Separation of Concerns）

```
config.ts    → 配置（读环境变量）
types.ts     → 数据契约（类型定义）
routes/      → HTTP 层（参数校验、状态码）
services/    → 业务层（引擎交互）
app.ts       → 组装层（中间件、路由挂载）
index.ts     → 启动层（创建实例、监听端口）
```

每层只做一件事，修改一层不影响其他层。

---

## 十三、Mock vs Flowable 对比

| 维度 | Mock | Flowable |
|---|---|---|
| 启动依赖 | 无 | Docker + MySQL |
| 数据存储 | 内存 Map | MySQL（ACT_* 表） |
| 数据持久化 | 重启丢失 | 永久保存 |
| 流程解析 | 不解析 BPMN | 完整解析并验证 |
| 任务自动生成 | 否（需 injectTask） | 是（引擎自动创建 userTask） |
| 网关分支 | 不支持 | 支持（排他/并行/包容网关） |
| 条件表达式 | 不支持 | 支持（UEL / JavaScript） |
| Service Task | 不支持 | 支持（Java Delegate / 外部任务） |
| 定时器事件 | 不支持 | 支持（Timer Event） |
| 适用场景 | 学习、演示、前端开发 | 生产、集成测试 |

**何时切换到 Flowable？**
- 需要网关分支流转
- 需要条件表达式（如 `amount > 1000` 走经理审批）
- 需要定时器事件
- 需要数据持久化
- 需要完整的 BPMN 执行语义

---

## 十四、REST API 完整参考

### 14.1 通用

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查，返回 `{ ok, engine, mode, port }` |

### 14.2 流程定义

| 方法 | 路径 | 请求体 | 响应 | 状态码 |
|---|---|---|---|---|
| POST | `/api/process/deploy` | `{ xml: string, name: string }` | `ProcessDefinition` | 200 / 400 / 500 |
| GET | `/api/process/definitions` | - | `ProcessDefinition[]` | 200 |
| GET | `/api/process/definitions/:id` | - | `ProcessDefinition` | 200 / 404 |

### 14.3 流程实例

| 方法 | 路径 | 请求体 | 响应 | 状态码 |
|---|---|---|---|---|
| POST | `/api/instance` | `{ definitionKey, businessKey?, variables? }` | `ProcessInstance` | 200 / 400 / 500 |
| GET | `/api/instance` | - | `ProcessInstance[]` | 200 |
| GET | `/api/instance/:id` | - | `ProcessInstance` | 200 / 404 |
| DELETE | `/api/instance/:id` | - | - | 204 / 500 |
| GET | `/api/instance/:id/activities` | - | `HistoricActivityInstance[]` | 200 |

### 14.4 任务

| 方法 | 路径 | 请求体/参数 | 响应 | 状态码 |
|---|---|---|---|---|
| GET | `/api/task` | query: `processInstanceId`, `assignee` | `UserTask[]` | 200 |
| GET | `/api/task/:id` | - | `UserTask` | 200 / 404 |
| POST | `/api/task/:id/complete` | `{ variables? }` | - | 204 / 500 |
| PUT | `/api/task/:id/assignee` | `{ assignee: string }` | - | 204 / 400 |
| POST | `/api/task/:id/comment` | `{ userId: string, message: string }` | `TaskComment` | 200 / 400 |
| GET | `/api/task/:id/comments` | - | `TaskComment[]` | 200 |

### 14.5 curl 测试示例

```bash
# 健康检查
curl http://localhost:3000/api/health

# 部署流程
curl -X POST http://localhost:3000/api/process/deploy \
  -H "Content-Type: application/json" \
  -d '{"xml":"<bpmn:definitions>...</bpmn:definitions>","name":"请假流程"}'

# 列出流程定义
curl http://localhost:3000/api/process/definitions

# 启动实例
curl -X POST http://localhost:3000/api/instance \
  -H "Content-Type: application/json" \
  -d '{"definitionKey":"leave_request","businessKey":"LEAVE-001","variables":{"reason":"病假"}}'

# 列出任务
curl http://localhost:3000/api/task

# 完成任务
curl -X POST http://localhost:3000/api/task/TASK_ID/complete \
  -H "Content-Type: application/json" \
  -d '{"variables":{"approved":true}}'

# 指派任务
curl -X PUT http://localhost:3000/api/task/TASK_ID/assignee \
  -H "Content-Type: application/json" \
  -d '{"assignee":"zhangsan"}'
```

---

## 十五、调试技巧

### 15.1 查看后端日志

`tsx watch` 运行时，控制台会输出：
```
[MockFlowable] 内存 Mock 模式启动
[MockFlowable] 部署流程定义: 请假流程 -> def-1700000000
[MockFlowable] 启动实例: xxx-uuid
[MockFlowable] 完成任务: yyy-uuid
```

Flowable 模式会显示：
```
[FlowableRest] 连接 http://localhost:8080
```

### 15.2 用 curl 快速验证

不需要前端，直接用 curl 调 API 验证后端逻辑。

### 15.3 Flowable 引擎排错

```bash
# 检查容器状态
docker compose ps

# 查看 Flowable 日志
docker compose logs flowable

# 查看 MySQL 日志
docker compose logs mysql

# Flowable 自带管理界面（仅 Flowable 模式）
# 浏览器访问 http://localhost:8080
# 用户名/密码见 .env 中的 FLOWABLE_USER/PASSWORD
```

### 15.4 环境变量确认

```bash
# 在 backend 目录下
node -e "require('dotenv/config'); console.log(process.env.MODE)"
```

### 15.5 Mock 模式手动注入任务

在 Mock 模式下，启动实例后需要手动注入任务才能在前端看到。可以通过修改 `index.ts` 临时添加：

```typescript
// 仅用于调试，不要提交
if (config.mode === 'mock') {
  const mockClient = client as MockFlowableClient;
  // 在某个实例上注入任务
  setTimeout(async () => {
    const insts = await mockClient.listInstances();
    if (insts.length > 0) {
      await mockClient.injectTask(insts[0].id, {
        name: '经理审批',
        taskDefinitionKey: 'Task_MgrApproval',
        assignee: 'zhangsan',
      });
    }
  }, 2000);
}
```

---

## 十六、扩展思路

### 16.1 添加 JWT 认证

```typescript
// app.ts
import jwt from 'express-jwt';

app.use(jwt({ secret: 'your-secret', algorithms: ['HS256'] })
  .unless({ path: ['/api/health'] }));
```

### 16.2 添加请求日志

```typescript
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});
```

### 16.3 添加限流

```typescript
import rateLimit from 'express-rate-limit';
app.use(rateLimit({ windowMs: 60_000, max: 100 }));
```

### 16.4 添加 WebSocket 实时通知

当任务创建/完成时，通过 WebSocket 推送给前端，实现任务列表实时刷新。

### 16.5 接入其他引擎

```typescript
// 新增 Camunda8Client
export class Camunda8Client implements FlowableClient {
  // 实现所有方法，调用 Camunda 8 Zeebe Gateway
}

// 修改 createClient()
export function createClient(): FlowableClient {
  switch (config.mode) {
    case 'flowable':  return new FlowableRestClient();
    case 'camunda8':  return new Camunda8Client();
    default:          return new MockFlowableClient();
  }
}
```

---

## 十七、推荐学习路径

```
1.  .env + config.ts          → 理解配置如何加载和使用
2.  types.ts                  → 理解数据契约（所有方法共用）
3.  services/flowable.ts      → 理解接口设计（双模式的契约）
4.  services/mockFlowable.ts  → 理解内存实现（最易读的实现）
5.  routes/process.ts         → 理解路由和参数校验
6.  routes/instance.ts        → 理解实例生命周期
7.  routes/task.ts            → 理解任务操作
8.  app.ts                    → 理解中间件链和 Client 工厂
9.  index.ts                  → 理解启动流程
10. services/flowableRest.ts  → 理解 Flowable REST API 适配
11. infra/flowable-app/       → 理解 Flowable Spring Boot 集成
12. docker-compose.yml        → 理解容器编排
```
