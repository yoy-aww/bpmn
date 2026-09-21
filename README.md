# BPMN 工作流项目

一个完整的 BPMN 工作流示例项目，采用 **前端 bpmn-js + Node.js 中间层 + Flowable 引擎** 技术栈。

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端建模 | bpmn-js 18.x + bpmn-js-properties-panel | BPMN 2.0 可视化建模器 |
| 前端框架 | React 18 + TypeScript + Vite | 熟悉的现代前端栈 |
| 中间层 | Node.js 24 + Express + TypeScript | REST API 网关 |
| 流程引擎 | Flowable 6.8+ (Java 17+) | Apache 2.0 开源 |
| 数据库 | MySQL 8.0 | Flowable 持久化 |

## 架构

```
┌─────────────────────────────────────────────────┐
│            前端 (React + TS + Vite)               │
│  ┌──────────────┐  ┌──────────┐  ┌──────────┐  │
│  │ BpmnEditor   │  │ TaskPanel│  │Instances │  │
│  │ (建模)       │  │ (任务)   │  │ (实例)   │  │
│  └──────┬───────┘  └────┬─────┘  └────┬─────┘  │
│         └────────────────┼─────────────┘        │
│                          │ HTTP REST             │
└──────────────────────────┼──────────────────────┘
                           ▼
┌─────────────────────────────────────────────────┐
│        中间层 (Node.js + Express + TS)            │
│  /api/process  /api/instance  /api/task          │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ FlowableClient                            │   │
│  │  MODE=mock   → 内存 Mock (无 Docker)      │   │
│  │  MODE=flowable → 调用 Flowable REST       │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────────┼──────────────────────┘
                           ▼ (可选)
┌─────────────────────────────────────────────────┐
│        Flowable Engine (Java 17+) + MySQL         │
│  /repository  /runtime  /task  /history          │
└─────────────────────────────────────────────────┘
```

## 快速开始

### 1. 启动后端（中间层）

```bash
cd backend
pnpm install
pnpm dev
# → http://localhost:3000
```

### 2. 启动前端

```bash
cd frontend
pnpm install
pnpm dev
# → http://localhost:5173
```

### 3. 可选：启动 Flowable 引擎

需要 Docker：

```bash
docker compose up -d
# Flowable 在 http://localhost:8080
# 把 backend/.env 里 MODE 改成 flowable 并重启后端
```

## 目录结构

```
BPMN/
├── README.md
├── docker-compose.yml          # Flowable + MySQL (可选)
├── .env.example
├── frontend/                   # React + TS + Vite + bpmn-js
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/
│   │   │   ├── BpmnEditor.tsx          # 建模器
│   │   │   ├── BpmnViewer.tsx          # 只读查看
│   │   │   ├── TaskPanel.tsx           # 任务面板
│   │   │   └── ProcessInstances.tsx    # 流程实例
│   │   ├── pages/
│   │   │   ├── ModelerPage.tsx
│   │   │   ├── TaskPage.tsx
│   │   │   └── InstancesPage.tsx
│   │   ├── services/
│   │   │   └── api.ts                  # API 客户端
│   │   └── types/
│   │       └── bpmn.ts
│   └── index.html
├── backend/                    # Node.js 中间层
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env
│   ├── src/
│   │   ├── index.ts                    # 入口
│   │   ├── app.ts                      # Express 应用
│   │   ├── config.ts                   # 配置
│   │   ├── routes/
│   │   │   ├── process.ts              # 流程定义路由
│   │   │   ├── instance.ts             # 流程实例路由
│   │   │   └── task.ts                 # 任务路由
│   │   ├── services/
│   │   │   ├── flowable.ts             # Flowable 客户端接口
│   │   │   ├── mockFlowable.ts         # 内存 Mock 实现
│   │   │   └── flowableRest.ts         # REST 实现
│   │   └── types.ts
│   └── ...
├── processes/                  # 示例 BPMN 流程文件
│   ├── order-approval.bpmn
│   └── leave-request.bpmn
└── docs/
    └── architecture.md
```

## 两种运行模式

### Mock 模式（默认，无需 Docker）

后端启动时 `MODE=mock`，所有数据存在内存中。适合学习和演示。

### Flowable 模式（生产）

```bash
# 启动 Flowable + MySQL
docker compose up -d

# 修改 backend/.env
MODE=flowable
FLOWABLE_URL=http://localhost:8080
FLOWABLE_USER=flowable
FLOWABLE_PASSWORD=***

# 重启后端
pnpm dev
```

## 示例流程

- `processes/order-approval.bpmn` - 订单审批流程
- `processes/leave-request.bpmn` - 请假申请流程

## License

MIT
