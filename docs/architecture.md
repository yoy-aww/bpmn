# BPMN 项目架构说明

## 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                     前端 (React + TS + Vite)                   │
│                                                                │
│  ┌─────────────────┐  ┌───────────────┐  ┌─────────────────┐ │
│  │  ModelerPage    │  │  TaskPage     │  │  InstancesPage  │ │
│  │  (建模)         │  │  (任务处理)   │  │  (实例监控)     │ │
│  │                 │  │               │  │                 │ │
│  │  bpmn-js        │  │  任务列表     │  │  实例列表       │ │
│  │  Modeler        │  │  评论/指派    │  │  启动/终止      │ │
│  └────────┬────────┘  └───────┬───────┘  └────────┬────────┘ │
│           │                   │                    │          │
│           └───────────────────┼────────────────────┘          │
│                               │ HTTP REST                      │
└───────────────────────────────┼──────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────┐
│                  中间层 (Node.js + Express + TS)               │
│                                                                │
│  /api/health          - 健康检查                               │
│  /api/process/*       - 流程定义 (部署/列表/详情)              │
│  /api/instance/*      - 流程实例 (启动/列表/终止/历史)        │
│  /api/task/*          - 任务 (列表/完成/指派/评论)             │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  FlowableClient 接口                                    │  │
│  │   └── MockFlowableClient  (MODE=mock, 默认)             │  │
│  │   └── FlowableRestClient  (MODE=flowable)               │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────┼──────────────────────────────┘
                                │ (可选, MODE=flowable 时)
                                ▼
┌──────────────────────────────────────────────────────────────┐
│               Flowable Engine (Java 17+) + MySQL               │
│                                                                │
│  flowable-spring-boot-starter                                  │
│  flowable-rest                                                 │
│                                                                │
│  /repository/deployments   - 部署流程定义                      │
│  /repository/process-definitions - 流程定义列表                │
│  /runtime/process-instances - 流程实例                         │
│  /task                    - 用户任务                           │
│  /history/activity-instances - 历史活动                        │
└──────────────────────────────────────────────────────────────┘
```

## 核心设计决策

### 1. 双模式运行 (Mock / Flowable)

- **Mock 模式** (默认)：内存存储，无需 Docker，适合学习和演示
- **Flowable 模式**：真实引擎，需要 Docker + MySQL，适合生产

通过 `MODE` 环境变量切换，前端代码无需改动。

### 2. REST API 优先

中间层通过 REST API 与 Flowable 通信，而非 Java SDK。原因：
- Node.js 不需要 JVM
- 任何语言都可以集成
- 调试更简单（curl 即可测试）

### 3. 前端自研 vs Camunda UI

- 自研 React 任务面板：用熟悉的栈，完全可控
- Camunda Cockpit / Tasklist：Angular 技术栈，学习成本高

### 4. bpmn-js 的选择

- BPMN 2.0 原生支持
- 开源 (MIT 核心 + bpmn.io license 扩展)
- 与 Camunda Modeler 同源
- 模块化设计，易于扩展

## 数据流

### 部署流程
```
1. 用户在 ModelerPage 编辑 BPMN 图
2. 点击"部署流程"
3. 前端调用 /api/process/deploy { xml, name }
4. 中间层 → FlowableClient.deploy()
5. Flowable 解析 XML，验证语法，存入 ACT_RE_* 表
6. 返回流程定义 ID
```

### 启动实例
```
1. 用户在 InstancesPage 选择流程定义
2. 填写业务 Key 和变量
3. 调用 /api/instance { definitionKey, businessKey, variables }
4. Flowable 创建实例，存入 ACT_RU_* 表
5. 实例按流程图执行，遇到 userTask 时生成任务
```

### 处理任务
```
1. 用户在 TaskPage 选择任务
2. 查看变量、添加评论、指派负责人
3. 点击"完成任务"
4. 调用 /api/task/:id/complete { variables }
5. Flowable 推进 Token，流转到下一个节点
6. 如果下一个是 userTask，生成新任务；如果是 endEvent，实例完成
```

## 部署选项

### 本地开发 (Mock 模式)
```bash
# 后端
cd backend && pnpm install && pnpm dev

# 前端
cd frontend && pnpm install && pnpm dev

# 访问 http://localhost:5173
```

### 本地开发 (Flowable 模式)
```bash
# 启动 Flowable + MySQL
docker compose up -d

# 配置 backend/.env
echo "MODE=flowable" > backend/.env

# 启动后端和前端 (同上)
```

### 生产部署
```bash
# 1. 部署 Flowable + MySQL (Docker Compose 或 K8s)
# 2. 部署后端 (Node.js + PM2 或 Docker)
# 3. 部署前端 (Nginx 静态资源 + 反向代理)
```

## 扩展点

### 添加新的流程类型
1. 在 `processes/` 目录添加新的 .bpmn 文件
2. 在前端 ModelerPage 部署
3. 不需要修改代码

### 添加自定义业务逻辑
- Service Task: 在 BPMN 中定义，通过 Java Delegate 或 External Task 实现
- Script Task: 内嵌脚本 (JavaScript/Groovy)
- 外部 Worker: 通过 REST API 拉取任务，在自己的服务中执行

### 添加用户认证
- 中间层添加 JWT 中间件
- 前端 axios 拦截器添加 Authorization header
- 任务指派和评论使用真实用户 ID

## 目录结构

```
BPMN/
├── README.md                      # 项目说明
├── docker-compose.yml             # Flowable + MySQL (可选)
├── backend/                       # Node.js 中间层
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── src/
│       ├── index.ts               # 入口
│       ├── app.ts                 # Express 应用
│       ├── config.ts              # 配置
│       ├── types.ts               # 类型定义
│       ├── routes/
│       │   ├── process.ts         # 流程定义路由
│       │   ├── instance.ts        # 流程实例路由
│       │   └── task.ts            # 任务路由
│       └── services/
│           ├── flowable.ts        # FlowableClient 接口
│           ├── mockFlowable.ts    # Mock 实现
│           └── flowableRest.ts    # REST 实现
├── frontend/                      # React + TS + Vite
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx               # 入口
│       ├── App.tsx                # 路由
│       ├── styles.css             # 样式
│       ├── components/
│       │   ├── BpmnEditor.tsx     # BPMN 建模器
│       │   ├── Header.tsx         # 头部导航
│       │   └── Toast.tsx          # 通知
│       ├── pages/
│       │   ├── ModelerPage.tsx    # 建模页面
│       │   ├── TaskPage.tsx       # 任务页面
│       │   └── InstancesPage.tsx  # 实例页面
│       ├── services/
│       │   └── api.ts             # API 客户端
│       └── types/
│           └── bpmn.ts            # 类型定义
├── infra/
│   └── flowable-app/              # Flowable Spring Boot 应用
│       ├── pom.xml
│       ├── Dockerfile
│       └── src/
│           ├── main/java/
│           │   └── com/bpmn/demo/
│           │       └── FlowableApplication.java
│           └── main/resources/
│               └── application.yml
├── processes/                     # 示例 BPMN 流程
│   ├── order-approval.bpmn        # 订单审批流程
│   └── leave-request.bpmn         # 请假申请流程
└── docs/
    └── architecture.md            # 架构文档
```

## 下一步扩展

- [ ] 用户认证 (JWT)
- [ ] 表单设计 (可嵌入 UserTask)
- [ ] 流程实例导出 (Excel/PDF)
- [ ] 定时任务 (Timer Event)
- [ ] 外部 Worker (HTTP 长轮询)
- [ ] 性能优化 (Redis 缓存)
- [ ] 监控告警 (Prometheus + Grafana)
