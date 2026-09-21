# BPMN 工作流项目 - 学习指南

本指南面向希望从零理解该项目的开发者，涵盖技术栈、架构设计、核心代码逐层解读、运行调试和扩展思路。

---

## 一、项目概览

这是一个完整的 **BPMN 2.0 工作流系统**，核心能力：

- **可视化建模**：在浏览器中拖拽绘制 BPMN 流程图
- **流程引擎**：部署流程定义、启动实例、自动流转
- **任务处理**：查看/完成/指派/评论用户任务
- **实例监控**：查看运行状态、历史活动

架构特点：**双模式运行** —— Mock 模式（内存模拟，零依赖启动）和 Flowable 模式（真实引擎，Docker 部署），通过一个环境变量切换，前端代码无需改动。

---

## 二、技术栈速览

| 层 | 技术 | 版本 | 作用 |
|---|---|---|---|
| 前端框架 | React + TypeScript + Vite | 18 / 5.5+ / 5.4+ | 现代 SPA |
| BPMN 建模 | bpmn-js + bpmn-js-properties-panel | 18.x / 5.x | BPMN 2.0 可视化建模器 |
| HTTP 客户端 | axios | 1.7+ | 前端 API 调用 |
| 路由 | react-router-dom | 6.x | 客户端路由 |
| 中间层 | Node.js + Express + TypeScript | 20+ / 4.x / 5.5+ | REST API 网关 |
| 流程引擎 | Flowable | 6.8.1 | BPMN 引擎（可选） |
| 数据库 | MySQL | 8.0 | Flowable 持久化（可选） |
| 容器化 | Docker + Docker Compose | - | Flowable + MySQL 编排 |

---

## 三、架构设计

### 3.1 三层架构

```
┌──────────────────────────────────────────────────┐
│            前端 (React + TS + Vite)                │
│  ┌────────────┐  ┌───────────┐  ┌─────────────┐ │
│  │ ModelerPage│  │ TaskPage  │  │InstancesPage│ │
│  │ (流程建模) │  │ (任务处理)│  │ (实例监控)  │ │
│  └─────┬──────┘  └─────┬─────┘  └──────┬──────┘ │
│        └───────────────┼───────────────┘         │
│                        │ HTTP REST                │
└────────────────────────┼─────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────┐
│        中间层 (Node.js + Express + TS)             │
│  /api/process/*   /api/instance/*   /api/task/*  │
│  ┌──────────────────────────────────────────┐    │
│  │  FlowableClient 接口                      │    │
│  │   ├── MockFlowableClient  (MODE=mock)     │    │
│  │   └── FlowableRestClient  (MODE=flowable) │    │
│  └──────────────────────────────────────────┘    │
└────────────────────────┬─────────────────────────┘
                         │ (可选)
                         ▼
┌──────────────────────────────────────────────────┐
│     Flowable Engine (Java 17) + MySQL 8.0        │
│     /repository  /runtime  /task  /history        │
└──────────────────────────────────────────────────┘
```

### 3.2 为什么需要中间层？

本项目没有让前端直接调用 Flowable REST API，而是加了一层 Node.js 中间层，原因：

1. **解耦**：前端不依赖 Flowable 的 API 格式，中间层可以做适配和裁剪
2. **Mock 支持**：没有 Flowable 时也能跑起来，降低学习和开发门槛
3. **安全**：Flowable 的 Basic Auth 凭证不暴露给浏览器
4. **扩展**：可在中间层加认证、限流、缓存等逻辑

### 3.3 策略模式 —— 双模式切换的关键

核心接口 `FlowableClient` 定义了所有引擎操作：

```typescript
// backend/src/services/flowable.ts
export interface FlowableClient {
  deploy(xml: string, name: string): Promise<ProcessDefinition>;
  listDefinitions(): Promise<ProcessDefinition[]>;
  startInstance(...): Promise<ProcessInstance>;
  listTasks(...): Promise<UserTask[]>;
  completeTask(...): Promise<void>;
  // ...
}
```

两个实现类：

| 实现类 | 文件 | 存储方式 | 适用场景 |
|---|---|---|---|
| `MockFlowableClient` | `services/mockFlowable.ts` | 内存 Map | 学习、演示、开发调试 |
| `FlowableRestClient` | `services/flowableRest.ts` | Flowable REST API | 生产环境 |

切换方式 —— 修改 `backend/.env`：

```
MODE=mock       # 默认，内存模式
MODE=flowable   # 真实引擎模式
```

`app.ts` 中的工厂函数根据配置创建对应实现：

```typescript
// backend/src/app.ts
export function createClient(): FlowableClient {
  if (config.mode === 'flowable') {
    return new FlowableRestClient();
  }
  return new MockFlowableClient();
}
```

---

## 四、前端代码逐层解读

### 4.1 入口与路由

**入口** `frontend/src/main.tsx`：

```typescript
ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
```

**路由** `frontend/src/App.tsx` —— 三个页面 + Toast 通知上下文：

```typescript
<Routes>
  <Route path="/" element={<Navigate to="/modeler" replace />} />
  <Route path="/modeler" element={<ModelerPage />} />      // 流程建模
  <Route path="/tasks" element={<TaskPage />} />            // 任务处理
  <Route path="/instances" element={<InstancesPage />} />   // 实例监控
</Routes>
```

**Header** `frontend/src/components/Header.tsx` —— 顶部导航 + 引擎健康状态指示灯（调用 `/api/health`）。

### 4.2 BpmnEditor 组件 —— bpmn-js 集成

文件：`frontend/src/components/BpmnEditor.tsx`

这是项目最核心的组件之一，将 bpmn-js Modeler 封装为 React 组件。

**设计模式**：`forwardRef` + `useImperativeHandle`，让父组件可以调用 `saveXML()`、`loadXML()`、`clear()` 等方法。

关键代码逻辑：

```typescript
// 1. 创建 Modeler 实例
const modeler = new BpmnModeler({ container: containerRef.current });

// 2. 导入 BPMN XML
modeler.importXML(xml).then(() => setReady(true));

// 3. 监听变更事件
modeler.on('element.changed', emitChange);
modeler.on('element.created', emitChange);

// 4. 暴露方法给父组件
useImperativeHandle(ref, () => ({
  async saveXML() { return (await modelerRef.current.saveXML({ format: true })).xml; },
  async loadXML(xml) { await modelerRef.current.importXML(xml); },
  clear() { modelerRef.current.clear(); },
}));

// 5. 自适应画布大小
const resizeObserver = new ResizeObserver(() => {
  const canvas = modeler.get('canvas');
  if (canvas?.resized) canvas.resized();
});
resizeObserver.observe(containerRef.current);
```

**默认 XML**：组件内置了一个最简流程模板（开始 → 审批任务 → 结束），确保首次打开就能看到流程图。

### 4.3 ModelerPage —— 建模页面

文件：`frontend/src/pages/ModelerPage.tsx`

布局：左侧 bpmn-js 画布 + 右侧侧边栏（已部署流程列表 + 操作提示）。

核心交互：
- 输入流程名称 → 点击「部署流程」→ 调用 `api.process.deploy(xml, name)`
- 侧边栏点击已部署流程 → 调用 `editorRef.current.loadXML(def.xml)` 加载到画布
- 「查看 XML」→ 弹窗显示格式化后的 BPMN XML

### 4.4 TaskPage —— 任务处理页面

文件：`frontend/src/pages/TaskPage.tsx`

布局：左侧任务列表 + 右侧任务详情面板。

功能：
- **筛选**：按负责人筛选任务
- **查看**：任务信息、变量、评论
- **指派**：将任务指派给某人
- **评论**：对任务添加评论
- **完成**：完成任务，推进流程

### 4.5 InstancesPage —— 实例监控页面

文件：`frontend/src/pages/InstancesPage.tsx`

布局：左侧实例列表 + 右侧实例详情。

功能：
- **启动实例**：选择流程定义 + 填写 businessKey 和变量 → 调用 `api.instance.start()`
- **查看详情**：状态、变量、历史活动
- **终止实例**：调用 `api.instance.terminate()`

### 4.6 API 客户端

文件：`frontend/src/services/api.ts`

基于 axios 封装，baseURL 为 `/api`，Vite 开发服务器通过代理转发到 `http://localhost:3000`：

```typescript
// vite.config.ts
proxy: {
  '/api': { target: 'http://localhost:3000', changeOrigin: true }
}
```

API 方法一览：

| 分类 | 方法 | HTTP | 路径 |
|---|---|---|---|
| 流程定义 | `process.deploy(xml, name)` | POST | `/api/process/deploy` |
| | `process.list()` | GET | `/api/process/definitions` |
| | `process.get(id)` | GET | `/api/process/definitions/:id` |
| 流程实例 | `instance.start(key, bizKey, vars)` | POST | `/api/instance` |
| | `instance.list()` | GET | `/api/instance` |
| | `instance.get(id)` | GET | `/api/instance/:id` |
| | `instance.terminate(id)` | DELETE | `/api/instance/:id` |
| | `instance.activities(id)` | GET | `/api/instance/:id/activities` |
| 任务 | `task.list(opts?)` | GET | `/api/task` |
| | `task.get(id)` | GET | `/api/task/:id` |
| | `task.complete(id, vars?)` | POST | `/api/task/:id/complete` |
| | `task.assign(id, assignee)` | PUT | `/api/task/:id/assignee` |
| | `task.comment(id, userId, msg)` | POST | `/api/task/:id/comment` |
| | `task.comments(id)` | GET | `/api/task/:id/comments` |

---

## 五、后端代码逐层解读

### 5.1 入口与配置

**入口** `backend/src/index.ts`：

```typescript
const client = createClient();        // 创建 FlowableClient 实例
const app = createApp(client);         // 创建 Express 应用
app.listen(config.port, () => { ... });
```

**配置** `backend/src/config.ts` —— 从环境变量读取，支持 `.env` 文件：

```
MODE=mock                     # 运行模式
PORT=3000                     # 后端端口
FLOWABLE_URL=http://localhost:8080   # Flowable 地址
FLOWABLE_USER=flowable        # Flowable 用户名
FLOWABLE_PASSWORD=***         # Flowable 密码
ALLOWED_ORIGINS=http://localhost:5174  # CORS 允许的前端地址
```

### 5.2 Express 应用

文件：`backend/src/app.ts`

中间件链：

```typescript
app.use(cors({ origin: config.allowedOrigins, credentials: true }));  // CORS
app.use(express.json({ limit: '5mb' }));                               // JSON 解析（支持大 BPMN XML）

app.get('/api/health', ...);           // 健康检查
app.use('/api/process', processRouter(client));   // 流程定义路由
app.use('/api/instance', instanceRouter(client));  // 流程实例路由
app.use('/api/task', taskRouter(client));          // 任务路由

app.use((req, res) => res.status(404).json({ error: ... }));   // 404
app.use((err, req, res, next) => res.status(500).json({ error: ... }));  // 错误处理
```

关键设计：所有路由都接收 `client: FlowableClient` 参数，路由逻辑与引擎实现完全解耦。

### 5.3 路由层

三个路由文件，结构清晰统一：

**`routes/process.ts`** —— 流程定义路由：

| 方法 | 路径 | 功能 |
|---|---|---|
| POST | `/api/process/deploy` | 部署流程（参数：xml, name） |
| GET | `/api/process/definitions` | 列出所有流程定义 |
| GET | `/api/process/definitions/:id` | 获取单个流程定义 |

**`routes/instance.ts`** —— 流程实例路由：

| 方法 | 路径 | 功能 |
|---|---|---|
| POST | `/api/instance` | 启动实例（参数：definitionKey, businessKey, variables） |
| GET | `/api/instance` | 列出所有实例 |
| GET | `/api/instance/:id` | 获取单个实例 |
| DELETE | `/api/instance/:id` | 终止实例 |
| GET | `/api/instance/:id/activities` | 获取历史活动 |

**`routes/task.ts`** —— 任务路由：

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/task` | 列出任务（可按 processInstanceId/assignee 筛选） |
| GET | `/api/task/:id` | 获取单个任务 |
| POST | `/api/task/:id/complete` | 完成任务（可选传 variables） |
| PUT | `/api/task/:id/assignee` | 指派任务 |
| POST | `/api/task/:id/comment` | 添加评论 |
| GET | `/api/task/:id/comments` | 获取评论列表 |

### 5.4 服务层 —— MockFlowableClient

文件：`backend/src/services/mockFlowable.ts`

纯内存实现，用 5 个 Map 存储所有数据：

```typescript
private definitions = new Map<string, ProcessDefinition>();    // 流程定义
private instances   = new Map<string, ProcessInstance>();      // 流程实例
private tasks       = new Map<string, UserTask>();             // 用户任务
private comments    = new Map<string, TaskComment[]>();        // 任务评论
private activities  = new Map<string, HistoricActivityInstance[]>(); // 历史活动
```

**值得学习的细节**：

- `deploy()` 方法用正则 `/<bpmn:process\s+id="([^"]+)"/` 从 XML 中提取流程 Key
- `completeTask()` 完成任务后会检查该实例是否还有剩余任务，没有则自动将实例标记为 COMPLETED
- `injectTask()` 是一个测试辅助方法，可以手动向实例注入任务（Mock 模式下 Flowable 不会自动生成任务）

**注意事项**：Mock 模式下，`startInstance()` 不会自动根据 BPMN XML 生成 userTask（因为那需要完整的 BPMN 解析和执行引擎），需要手动 `injectTask()` 或切换到 Flowable 模式。

### 5.5 服务层 —— FlowableRestClient

文件：`backend/src/services/flowableRest.ts`

通过 HTTP 调用 Flowable REST API，使用 Basic Auth 认证：

```typescript
this.auth = Buffer.from(`${config.flowable.user}:${config.flowable.password}`).toString('base64');
```

与 Flowable REST API 的映射关系：

| 本项目方法 | Flowable REST API | HTTP |
|---|---|---|
| `deploy()` | POST `/repository/deployments` (multipart) | 部署流程 |
| `listDefinitions()` | GET `/repository/process-definitions?latest=true` | 流程定义列表 |
| `startInstance()` | POST `/runtime/process-instances` | 启动实例 |
| `listTasks()` | GET `/task` | 任务列表 |
| `completeTask()` | POST `/task/:id/complete` | 完成任务 |
| `assignTask()` | PUT `/task/:id/assignee` | 指派 |
| `getHistoricActivities()` | GET `/history/activity-instances` | 历史活动 |

数据映射：Flowable 返回的 JSON 字段名与本项目接口不完全一致，`mapDefinition()`、`mapInstance()`、`mapTask()` 方法负责转换。

### 5.6 类型定义

文件：`backend/src/types.ts` 和 `frontend/src/types/bpmn.ts`

前后端类型定义一致，核心类型：

```
ProcessDefinition    → 流程定义（id, key, name, version, xml, ...）
ProcessInstance      → 流程实例（id, state, variables, startTime, endTime, ...）
UserTask             → 用户任务（id, name, assignee, variables, ...）
TaskComment          → 任务评论（id, userId, message, ...）
HistoricActivityInstance → 历史活动（activityId, activityType, startTime, endTime, ...）
```

---

## 六、BPMN 2.0 流程文件解读

### 6.1 请假申请流程 (`processes/leave-request.bpmn`)

一条简单的线性流程：

```
提交申请 → 经理审批 → HR处理 → 完成
```

XML 结构解析：

```xml
<bpmn:process id="leave_request" name="请假申请流程" isExecutable="true">
  <!-- 开始事件 -->
  <bpmn:startEvent id="Start_Leave" name="提交申请">
    <bpmn:outgoing>Flow_ToMgr</bpmn:outgoing>
  </bpmn:startEvent>

  <!-- 用户任务：经理审批 -->
  <bpmn:userTask id="Task_MgrApproval" name="经理审批">
    <bpmn:incoming>Flow_ToMgr</bpmn:incoming>
    <bpmn:outgoing>Flow_ToHR</bpmn:outgoing>
  </bpmn:userTask>

  <!-- 用户任务：HR处理 -->
  <bpmn:userTask id="Task_HRProcess" name="HR处理">
    <bpmn:incoming>Flow_ToHR</bpmn:incoming>
    <bpmn:outgoing>Flow_ToEnd</bpmn:outgoing>
  </bpmn:userTask>

  <!-- 结束事件 -->
  <bpmn:endEvent id="End_Leave" name="完成">
    <bpmn:incoming>Flow_ToEnd</bpmn:incoming>
  </bpmn:endEvent>

  <!-- 顺序流（连线） -->
  <bpmn:sequenceFlow id="Flow_ToMgr" sourceRef="Start_Leave" targetRef="Task_MgrApproval"/>
  <bpmn:sequenceFlow id="Flow_ToHR" sourceRef="Task_MgrApproval" targetRef="Task_HRProcess"/>
  <bpmn:sequenceFlow id="Flow_ToEnd" sourceRef="Task_HRProcess" targetRef="End_Leave"/>
</bpmn:process>
```

**核心概念**：
- `<bpmn:process>` — 流程定义，`id` 是流程 Key，`isExecutable="true"` 表示可执行
- `<bpmn:startEvent>` / `<bpmn:endEvent>` — 开始/结束事件
- `<bpmn:userTask>` — 用户任务（需要人工处理的节点）
- `<bpmn:sequenceFlow>` — 顺序流（连线），`sourceRef` 和 `targetRef` 连接节点
- `<bpmn:incoming>` / `<bpmn:outgoing>` — 节点的入/出连线引用

### 6.2 订单审批流程 (`processes/order-approval.bpmn`)

包含排他网关（分支判断）的流程：

```
收到订单 → 订单审核 → [金额检查] → 大额: 经理审批 → 发货 → 订单完成
                              └──────── 小额: 直接发货 ──┘
```

新增元素 —— **排他网关** `<bpmn:exclusiveGateway>`：

```xml
<bpmn:exclusiveGateway id="Gateway_Amount" name="金额检查">
  <bpmn:incoming>Flow_ToGateway</bpmn:incoming>
  <bpmn:outgoing>Flow_Large</bpmn:outgoing>
  <bpmn:outgoing>Flow_Small</bpmn:outgoing>
</bpmn:exclusiveGateway>

<!-- 条件分支 -->
<bpmn:sequenceFlow id="Flow_Large" sourceRef="Gateway_Amount" targetRef="Task_ManagerApproval">
  <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">amount &gt; 1000</bpmn:conditionExpression>
</bpmn:sequenceFlow>
<bpmn:sequenceFlow id="Flow_Small" sourceRef="Gateway_Amount" targetRef="Task_Shipping">
  <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">amount &lt;= 1000</bpmn:conditionExpression>
</bpmn:sequenceFlow>
```

**排他网关**：根据条件表达式走唯一一条分支。`conditionExpression` 中引用流程变量（如 `amount`），引擎运行时根据变量值决定走哪条分支。

---

## 七、基础设施

### 7.1 Docker Compose

文件：`docker-compose.yml`

编排两个服务：

- **flowable-app**：自定义 Flowable Spring Boot 应用，端口 8080
  - 基于 `infra/flowable-app/Dockerfile` 多阶段构建（Maven 编译 → JRE 运行）
  - 依赖 MySQL 健康检查通过后启动
  - 自带健康检查：`curl http://localhost:8080/actuator/health`

- **mysql**：MySQL 8.0，端口 3306
  - 字符集 utf8mb4
  - 健康检查：`mysqladmin ping`
  - 数据持久化到 Docker volume `mysql_data`

### 7.2 Flowable Spring Boot 应用

目录：`infra/flowable-app/`

**`pom.xml`** 依赖：
- `flowable-spring-boot-starter` 6.8.1 — Flowable 核心引擎
- `flowable-rest` — REST API 模块
- `spring-boot-starter-actuator` — 健康检查端点
- `mysql-connector-j` — MySQL 驱动
- `h2` — 可选的内存数据库（本地测试用）

**`Dockerfile`**：多阶段构建
1. 阶段一：`maven:3.9` 编译 Java 项目
2. 阶段二：`eclipse-temurin:17-jre-alpine` 运行 JAR

---

## 八、快速启动

### 8.1 Mock 模式（推荐首次使用）

无需 Docker，两个终端即可运行：

```bash
# 终端 1：启动后端
cd backend
npm install
npm run dev
# → http://localhost:3000

# 终端 2：启动前端
cd frontend
npm install
npm run dev
# → http://localhost:5174
```

打开 `http://localhost:5174`，即可使用。

### 8.2 Flowable 模式

```bash
# 1. 启动 Flowable + MySQL
docker compose up -d

# 2. 等待健康检查通过（约 30-60 秒）
docker compose ps  # 确认两个服务都是 healthy

# 3. 修改后端配置
# 在 backend/.env 中设置：
# MODE=flowable
# FLOWABLE_URL=http://localhost:8080

# 4. 启动后端和前端（同 Mock 模式）
```

### 8.3 验证

- 前端 Header 右上角的健康指示灯：绿色 = 引擎在线
- 直接访问 `http://localhost:3000/api/health` 查看引擎状态
- Flowable 模式下还可以访问 `http://localhost:8080` 查看 Flowable 自带的管理界面

---

## 九、完整操作流程演示

### 9.1 部署流程

1. 打开「流程建模」页面
2. 在 bpmn-js 画布上拖拽元素，绘制流程图（或使用默认模板）
3. 输入流程名称，如「请假申请」
4. 点击「部署流程」
5. 侧边栏出现已部署的流程定义

### 9.2 启动实例

1. 打开「流程实例」页面
2. 点击「启动新实例」
3. 选择流程定义，填写业务 Key（如 `LEAVE-001`）和变量（如 `reason=病假`）
4. 点击「启动」

### 9.3 处理任务

1. 打开「任务处理」页面
2. 在左侧任务列表选择一个任务
3. 查看任务详情和变量
4. 可选：指派负责人、添加评论
5. 点击「完成任务」，流程自动流转到下一个节点

> **Mock 模式注意**：MockFlowableClient 不会自动根据 BPMN 生成任务，需要手动 `injectTask()` 或在实例启动后用 API 注入。要体验完整流程自动流转，请使用 Flowable 模式。

---

## 十、样式设计

文件：`frontend/src/styles.css`

### 整体风格

暗色主题（`--bg: #1a1d23`），BPMN 画布保持浅色背景（`--canvas-bg: #f5f6f8`），这是 BPMN 业界惯例。

### CSS 变量体系

```css
--bg: #1a1d23            /* 主背景 */
--bg-card: #242830       /* 卡片背景 */
--bg-elevated: #2d323c   /* 悬浮层背景 */
--border: #3a3f4b        /* 边框 */
--text: #e4e6eb          /* 主文字 */
--text-muted: #9aa0aa    /* 次要文字 */
--accent: #4a9eff        /* 主题色（蓝） */
--success: #4caf50       /* 成功（绿） */
--warning: #ff9800       /* 警告（橙） */
--error: #f44336         /* 错误（红） */
--canvas-bg: #f5f6f8     /* 画布背景（浅色） */
```

### bpmn-js 画布适配

由于外层是暗色主题而画布是浅色，CSS 中大量使用 `!important` 覆盖 bpmn-js 默认样式：

- 调色板（`.djs-palette`）白色背景
- 上下文菜单（`.djs-context-pad`）白色背景
- 连线深灰色在白底上清晰可见
- 选中元素蓝色高亮

---

## 十一、核心设计模式总结

### 11.1 策略模式（Strategy Pattern）

`FlowableClient` 接口 + 两种实现，运行时通过配置切换。这是本项目最核心的设计模式。

**好处**：
- 前端和路由层完全不关心底层实现
- 新增引擎适配（如 Camunda）只需添加一个实现类
- 测试时可以轻松 Mock

### 11.2 工厂模式（Factory Pattern）

`createClient()` 函数根据 `config.mode` 创建对应实例。

### 11.3 依赖注入（DI）

路由通过函数参数接收 `FlowableClient`，而非自行创建：

```typescript
export function processRouter(client: FlowableClient): Router { ... }
```

### 11.4 组件命令式 API

`BpmnEditor` 使用 `forwardRef` + `useImperativeHandle` 暴露命令式方法，让父组件可以操作子组件内部状态。

---

## 十二、常见问题与排错

### Q1: 前端启动后画布空白？

检查浏览器控制台是否有 bpmn-js 导入错误。确保 `npm install` 已执行，`bpmn-js` 依赖安装完整。

### Q2: 前端 API 调用 404？

确认后端已启动（`http://localhost:3000/api/health` 可访问），且 Vite 代理配置正确。

### Q3: Flowable 模式下部署失败？

- 检查 Docker 容器是否健康：`docker compose ps`
- 检查 `backend/.env` 中 `FLOWABLE_URL` 是否正确
- 查看 Flowable 日志：`docker compose logs flowable`

### Q4: Mock 模式下启动实例后没有任务？

这是预期行为。Mock 模式不会自动根据 BPMN XML 生成和流转任务。解决方案：
- 使用 Flowable 模式体验完整流程流转
- 或通过代码调用 `mockClient.injectTask()` 手动注入任务

### Q5: 前端端口是多少？

Vite 配置的端口是 **5174**（非默认的 5173），后端 CORS 的 `allowedOrigins` 也是 `http://localhost:5174`。如果修改了前端端口，需同步修改后端 CORS 配置。

---

## 十三、扩展思路

### 13.1 添加用户认证

1. 中间层添加 JWT 中间件（如 `express-jwt`）
2. 前端 axios 拦截器添加 `Authorization` header
3. 任务指派和评论使用真实用户 ID

### 13.2 动态表单

1. 在 UserTask 上设置 `formKey` 属性
2. 设计表单 Schema（JSON Schema）
3. 前端根据 Schema 渲染动态表单
4. 完成任务时将表单数据作为 variables 传入

### 13.3 流程图高亮当前节点

1. 获取实例的 `currentActivityIds`
2. 使用 bpmn-js Viewer + Overlays API 在当前节点上叠加高亮标记
3. 或使用 `Modeler#colorize` API 改变节点颜色

### 13.4 添加排他网关的条件变量支持

1. 在 TaskPage 完成任务时，允许用户设置条件变量（如 `amount=2000`）
2. Flowable 引擎会根据条件自动选择分支

### 13.5 接入其他引擎

实现 `FlowableClient` 接口，如：
- `Camunda8Client` — 调用 Camunda 8 Zeebe Gateway
- `ActivitiClient` — 调用 Activiti REST API

只需新建一个实现类 + 修改 `createClient()` 即可。

---

## 十四、推荐学习路径

```
1. 启动项目（Mock 模式） → 在界面操作一遍完整流程
2. 阅读 frontend/src/types/bpmn.ts → 理解数据模型
3. 阅读 frontend/src/services/api.ts → 理解 API 调用
4. 阅读 backend/src/services/flowable.ts → 理解接口设计
5. 阅读 backend/src/services/mockFlowable.ts → 理解内存实现
6. 阅读 frontend/src/components/BpmnEditor.tsx → 理解 bpmn-js 集成
7. 阅读 backend/src/routes/*.ts → 理解路由和错误处理
8. 阅读 processes/*.bpmn → 理解 BPMN 2.0 XML 结构
9. 切换到 Flowable 模式 → 体验真实引擎的流程流转
10. 阅读 infra/flowable-app/ → 理解 Flowable Spring Boot 集成
```
