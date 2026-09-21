# BPMN 工作流前端 - 学习文档

本文档专注于前端部分（`frontend/`），从目录结构、技术选型、每个文件的作用、组件设计模式、样式体系到调试技巧，逐层拆解。

---

## 一、目录结构

```
frontend/
├── index.html                 # HTML 入口
├── package.json               # 依赖与脚本
├── tsconfig.json              # TypeScript 配置
├── tsconfig.node.json         # Node 端 TS 配置（Vite 专用）
├── vite.config.ts             # Vite 构建与开发服务器配置
└── src/
    ├── main.tsx               # 应用挂载入口
    ├── App.tsx                # 路由定义与布局
    ├── styles.css             # 全局样式（含 bpmn-js 适配）
    ├── components/
    │   ├── BpmnEditor.tsx     # BPMN 建模器（核心组件）
    │   ├── Header.tsx         # 顶部导航栏
    │   └── Toast.tsx          # 通知提示
    ├── pages/
    │   ├── ModelerPage.tsx    # 流程建模页面
    │   ├── TaskPage.tsx       # 任务处理页面
    │   └── InstancesPage.tsx  # 流程实例页面
    ├── services/
    │   └── api.ts             # 后端 API 客户端
    └── types/
        └── bpmn.ts            # TypeScript 类型定义
```

**设计原则**：按职责分层 —— 组件（components）是可复用的 UI 单元，页面（pages）组装组件并管理业务状态，服务（services）封装外部通信，类型（types）统一数据契约。

---

## 二、技术选型与配置

### 2.1 核心依赖

| 包名 | 版本 | 用途 |
|---|---|---|
| `react` / `react-dom` | 18.3+ | UI 框架 |
| `react-router-dom` | 6.26+ | 客户端路由 |
| `bpmn-js` | 18.9+ | BPMN 2.0 建模器核心 |
| `bpmn-js-properties-panel` | 5.52+ | 元素属性编辑面板 |
| `bpmn-moddle` | 9.0+ | BPMN XML 元模型定义 |
| `diagram-js` | 15.9+ | 画布底层（bpmn-js 依赖） |
| `axios` | 1.7+ | HTTP 客户端 |
| `vite` | 5.4+ | 构建工具 |
| `typescript` | 5.5+ | 类型系统 |

### 2.2 Vite 配置详解

文件：`vite.config.ts`

```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,           // 固定端口 5174（非默认 5173）
    strictPort: true,     // 端口被占用时直接报错，不自动尝试下一个
    proxy: {
      '/api': {
        target: 'http://localhost:3000',  // 代理到后端
        changeOrigin: true,               // 修改 Origin 头
      },
    },
  },
  optimizeDeps: {
    include: ['bpmn-js', 'bpmn-js-properties-panel'],
    // 预构建这些包，避免开发时每次冷启动都重新分析
  },
});
```

**为什么要代理？** 前端运行在 `:5174`，后端运行在 `:3000`，浏览器直接请求 `:3000` 会跨域。Vite 代理让前端代码中写 `/api/xxx` 即可，开发服务器自动转发到后端。

**为什么端口是 5174？** 避免 5173 与其他项目冲突。后端的 CORS 配置 `allowedOrigins` 也必须包含 `http://localhost:5174`。

### 2.3 TypeScript 配置

`tsconfig.json` 关键配置：

```json
{
  "compilerOptions": {
    "target": "ES2022",            // 编译目标
    "lib": ["ES2022", "DOM"],      // 类型库
    "module": "ESNext",            // 模块系统（ESM）
    "moduleResolution": "Bundler", // 模块解析策略（Vite 场景）
    "jsx": "react-jsx",           // JSX 转换方式（React 17+ 新 JSX 转换）
    "strict": true,                // 严格模式
    "noUnusedLocals": true,        // 禁止未使用的局部变量
    "noUnusedParameters": true,    // 禁止未使用的参数
    "allowImportingTsExtensions": true  // 允许 .ts 扩展名导入
  }
}
```

`tsconfig.node.json` 专门给 `vite.config.ts` 使用，因为 Vite 配置文件运行在 Node 环境而非浏览器。

---

## 三、应用入口与路由

### 3.1 HTML 入口

文件：`index.html`

```html
<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
```

Vite 以此为入口，`type="module"` 表示使用 ESM 方式加载。

### 3.2 React 挂载

文件：`src/main.tsx`

```typescript
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
```

- `BrowserRouter` 在最顶层提供路由上下文
- `styles.css` 在此全局导入，确保所有页面共享样式

### 3.3 路由与布局

文件：`src/App.tsx`

```typescript
export default function App() {
  return (
    <ToastProvider>
      <div className="app-layout">
        <Header />
        <div className="app-content">
          <Routes>
            <Route path="/" element={<Navigate to="/modeler" replace />} />
            <Route path="/modeler" element={<ModelerPage />} />
            <Route path="/tasks" element={<TaskPage />} />
            <Route path="/instances" element={<InstancesPage />} />
          </Routes>
        </div>
      </div>
    </ToastProvider>
  );
}
```

**布局结构**：

```
┌────────────────────────────────────────┐
│              Header (56px)              │
├────────────────────────────────────────┤
│                                        │
│           app-content (flex:1)          │
│           ← 各页面内容填满此处           │
│                                        │
└────────────────────────────────────────┘
```

- `ToastProvider` 包裹全局，使任何页面都能调用 `useToast()` 弹出通知
- `/` 自动重定向到 `/modeler`
- `app-layout` 用 `flex-direction: column` + `height: 100vh` 实现满屏布局

---

## 四、组件详解

### 4.1 Header —— 顶部导航栏

文件：`src/components/Header.tsx`

功能：三个导航链接 + 引擎健康状态指示灯。

```typescript
export default function Header() {
  const [health, setHealth] = useState<{ ok: boolean; engine: string; mode: string } | null>(null);

  useEffect(() => {
    api.health()
      .then(setHealth)
      .catch(() => setHealth({ ok: false, engine: 'unknown', mode: 'unknown' }));
  }, []);

  return (
    <header className="app-header">
      <div className="app-title">BPMN 工作流平台</div>
      <nav className="app-nav">
        <NavLink to="/modeler">📝 流程建模</NavLink>
        <NavLink to="/tasks">✅ 任务处理</NavLink>
        <NavLink to="/instances">📊 流程实例</NavLink>
      </nav>
      <div className="health-badge">
        <span className={`health-dot${health?.ok ? ' ok' : ''}`} />
        <span>{health ? `${health.mode} · ${health.engine}` : '检测中...'}</span>
      </div>
    </header>
  );
}
```

**学习要点**：
- `NavLink` 替代 `Link`，自带 `isActive` 属性实现导航高亮
- `useEffect` 仅在挂载时请求一次健康状态（依赖数组 `[]`）
- 健康指示灯用 CSS 动画 `pulse` 实现呼吸灯效果

### 4.2 Toast —— 全局通知

文件：`src/components/Toast.tsx`

基于 React Context 的全局通知系统。

**设计模式**：

```
ToastProvider (Context Provider)
  ├── 提供 showToast 方法
  ├── 渲染 children（整个应用）
  └── 渲染 toast-container（固定定位，右上角）

useToast() (Custom Hook)
  └── 消费 Context，返回 showToast
```

核心代码：

```typescript
let toastId = 0;   // 全局递增 ID

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeouts = useRef<Map<number, any>>(new Map());   // 存储 timeout 引用，用于清理

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, type, message }]);

    // 4 秒后自动移除
    const timeout = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      timeouts.current.delete(id);
    }, 4000);
    timeouts.current.set(id, timeout);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => <div className={`toast toast-${t.type}`}>{t.message}</div>)}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
```

**学习要点**：
- `useRef` 存储 timeout Map，避免组件重渲染时丢失引用
- `useCallback` 包裹 `showToast`，避免每次渲染创建新函数
- 四种类型 `success / error / warning / info`，用左边框颜色区分
- CSS `slideIn` 动画实现入场效果

### 4.3 BpmnEditor —— BPMN 建模器（核心组件）

文件：`src/components/BpmnEditor.tsx`

这是项目最复杂也最重要的组件，将 [bpmn-js](https://github.com/bpmn-io/bpmn-js) 集成到 React 中。

#### 4.3.1 接口设计

```typescript
// 暴露给父组件的命令式方法
export interface BpmnEditorHandle {
  saveXML: () => Promise<string>;    // 保存当前画布为 BPMN XML
  loadXML: (xml: string) => Promise<void>;  // 加载 BPMN XML 到画布
  clear: () => void;                 // 清空画布
  getDefinitions: () => any;         // 获取底层 definitions 对象
}

// 组件 props
interface BpmnEditorProps {
  initialXml?: string;    // 初始 BPMN XML
  onChange?: (xml: string) => void;  // 画布变更回调
}
```

#### 4.3.2 组件结构

```typescript
const BpmnEditor = forwardRef<BpmnEditorHandle, BpmnEditorProps>(
  function BpmnEditor({ initialXml, onChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);      // DOM 容器
    const modelerRef = useRef<BpmnModeler | null>(null);    // Modeler 实例

    // ... 初始化 Modeler
    // ... 暴露命令式 API
    // ... 渲染容器
  }
);
```

#### 4.3.3 初始化流程

```typescript
useEffect(() => {
  if (!containerRef.current) return;

  // 1. 创建 Modeler 实例
  const modeler = new BpmnModeler({
    container: containerRef.current,   // 挂载到 DOM
  });
  modelerRef.current = modeler;

  // 2. 导入 XML（优先用 initialXml，否则用内置默认模板）
  const xml = initialXml || DEFAULT_XML;
  modeler.importXML(xml)
    .then(() => setReady(true))
    .catch((err) => {
      setError(err.message);
      modeler.importXML(DEFAULT_XML).then(() => setReady(true));  // 降级到默认模板
    });

  // 3. 监听变更事件 → 通知父组件
  const emitChange = () => {
    if (!onChange || !modelerRef.current) return;
    modelerRef.current.saveXML().then(({ xml: newXml }) => {
      if (newXml) onChange(newXml);
    });
  };
  modeler.on('element.changed', emitChange);
  modeler.on('element.created', emitChange);

  // 4. 自适应容器大小
  const resizeObserver = new ResizeObserver(() => {
    const canvas = modeler.get<any>('canvas');
    if (canvas?.resized) canvas.resized();
  });
  resizeObserver.observe(containerRef.current);

  // 5. 清理
  return () => {
    resizeObserver.disconnect();
    modeler.destroy();
    modelerRef.current = null;
  };
}, []);   // 仅挂载时执行一次
```

**关键细节**：

| 步骤 | 说明 |
|---|---|
| `new BpmnModeler({ container })` | bpmn-js 需要一个 DOM 容器来渲染 SVG 画布 |
| `importXML()` | 解析 BPMN XML 并渲染到画布，返回 Promise |
| `modeler.on('element.changed', ...)` | 监听元素变更，实时同步 XML 给父组件 |
| `ResizeObserver` | 容器尺寸变化时通知 bpmn-js 重绘（如侧边栏展开/收起） |
| `modeler.destroy()` | 卸载时销毁 Modeler，避免内存泄漏 |

#### 4.3.4 命令式 API

```typescript
useImperativeHandle(ref, () => ({
  async saveXML(): Promise<string> {
    const { xml } = await modelerRef.current.saveXML({ format: true });
    return xml || '';              // format: true 表示格式化输出
  },
  async loadXML(xml: string): Promise<void> {
    await modelerRef.current.importXML(xml);
    const canvas = modelerRef.current.get<any>('canvas');
    if (canvas?.resized) canvas.resized();   // 加载后通知画布刷新
  },
  clear(): void {
    modelerRef.current.clear();
    const canvas = modelerRef.current.get<any>('canvas');
    if (canvas?.resized) canvas.resized();
  },
  getDefinitions(): any {
    return modelerRef.current?.getDefinitions();   // 获取底层 BPMN 模型对象
  },
}));
```

**为什么用 `forwardRef` + `useImperativeHandle`？**

bpmn-js 是命令式库（创建实例、调用方法），而 React 是声明式的。这种模式让父组件可以命令式地操作子组件内部的 Modeler 实例，而不需要通过 props 传递回调。

#### 4.3.5 内置默认 XML

组件内置了一个最简流程模板，确保首次打开就有流程图可看：

```xml
<bpmn:process id="Process_1" name="示例流程" isExecutable="true">
  <bpmn:startEvent id="StartEvent_1" name="开始" />
  <bpmn:userTask id="Task_Approval" name="审批任务" />
  <bpmn:endEvent id="EndEvent_1" name="结束" />
  <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_Approval"/>
  <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_Approval" targetRef="EndEvent_1"/>
</bpmn:process>
```

包含完整的 `<bpmndi:BPMNDiagram>` 图形信息（坐标、尺寸），否则 bpmn-js 无法渲染。

---

## 五、页面详解

### 5.1 ModelerPage —— 流程建模

文件：`src/pages/ModelerPage.tsx`

**布局**：

```
┌─ toolbar ──────────────────────────────────────────┐
│ [流程名称输入框] [🚀 部署流程]        [📋 查看XML] [🗑️ 清空] │
├──────────────────────────────┬──────────────────────┤
│                              │ editor-sidebar       │
│     editor-canvas            │  ┌────────────────┐  │
│     (BpmnEditor)             │  │ 已部署流程列表  │  │
│                              │  │  - 流程A v1     │  │
│     浅色背景 + 网格          │  │  - 流程B v2     │  │
│                              │  └────────────────┘  │
│                              │  ┌────────────────┐  │
│                              │  │ 操作提示        │  │
│                              │  └────────────────┘  │
└──────────────────────────────┴──────────────────────┘
```

**核心状态**：

```typescript
const editorRef = useRef<BpmnEditorHandle>(null);  // BpmnEditor 实例引用
const [name, setName] = useState('');               // 流程名称
const [definitions, setDefinitions] = useState<ProcessDefinition[]>([]);  // 已部署列表
const [deploying, setDeploying] = useState(false);  // 部署中状态
```

**核心交互流程**：

1. **部署流程**：
   ```typescript
   const xml = await editorRef.current.saveXML();   // 从画布获取 XML
   const def = await api.process.deploy(xml, name); // 调用后端部署
   refreshDefinitions();                             // 刷新已部署列表
   ```

2. **加载已部署流程**：
   ```typescript
   await editorRef.current.loadXML(def.xml);  // 将 XML 加载到画布
   setName(def.name);                          // 同步名称
   ```

3. **查看 XML**：弹窗显示格式化后的 BPMN XML，支持复制到剪贴板

**学习要点**：
- `useRef<BpmnEditorHandle>` 持有子组件的命令式 API 引用
- 部署按钮有 `disabled={deploying}` 防重复提交
- 侧边栏的流程定义卡片点击后高亮（`selectedDefId` 状态）

### 5.2 TaskPage —— 任务处理

文件：`src/pages/TaskPage.tsx`

**布局**：

```
┌─ toolbar ────────────────────────────────────┐
│ [按负责人筛选...]                 [🔄 刷新]  │
├────────────────────┬─────────────────────────┤
│ task-list (360px)  │ task-detail             │
│                    │  ┌──────────────────┐    │
│  ┌──────────────┐  │  │ 任务信息        │    │
│  │ 经理审批     │  │  │  ID / 名称 / ..  │    │
│  │ 👤张三 🔑xxx │  │  ├──────────────────┤    │
│  └──────────────┘  │  │ 变量            │    │
│  ┌──────────────┐  │  ├──────────────────┤    │
│  │ HR处理       │  │  │ 指派任务        │    │
│  │ 👤未指派 🔑xxx│  │  │ [用户名] [指派]  │    │
│  └──────────────┘  │  ├──────────────────┤    │
│                    │  │ 评论            │    │
│                    │  │ [输入评论] [发送] │    │
│                    │  ├──────────────────┤    │
│                    │  │ [✅ 完成任务]    │    │
│                    │  └──────────────────┘    │
└────────────────────┴─────────────────────────┘
```

**核心状态**：

```typescript
const [tasks, setTasks] = useState<UserTask[]>([]);            // 任务列表
const [selectedTask, setSelectedTask] = useState<UserTask | null>(null);  // 选中的任务
const [comments, setComments] = useState<TaskComment[]>([]);    // 选中任务的评论
const [filterAssignee, setFilterAssignee] = useState('');       // 筛选条件
```

**核心交互**：

1. **筛选**：输入负责人 → `useEffect` 监听 `filterAssignee` 变化自动刷新
   ```typescript
   useEffect(() => { refreshTasks(); }, [filterAssignee]);
   ```

2. **选择任务**：点击任务卡片 → 加载评论
   ```typescript
   const handleSelectTask = async (task: UserTask) => {
     setSelectedTask(task);
     const c = await api.task.comments(task.id);
     setComments(c);
   };
   ```

3. **完成任务**：调用 `api.task.complete(id)` → 清空选中 → 刷新列表

4. **指派**：调用 `api.task.assign(id, assignee)` → 刷新列表

5. **评论**：调用 `api.task.comment(id, 'demo-user', message)` → 追加到评论列表

**学习要点**：
- 左右分栏用 CSS Grid：`gridTemplateColumns: '360px 1fr'`
- 任务卡片选中效果：`.task-card.selected` 带左侧蓝色阴影
- 评论输入框支持 `Enter` 键提交（`onKeyDown`）

### 5.3 InstancesPage —— 流程实例

文件：`src/pages/InstancesPage.tsx`

**布局**：

```
┌─ toolbar ──────────────────────────────────┐
│ [🚀 启动新实例]                  [🔄 刷新] │
├──────────────────────┬─────────────────────┤
│ 流程实例列表 (1fr)   │ 实例详情 (1fr)       │
│  ┌────────────────┐  │  ID / 定义Key / ... │
│  │ ID │名称│状态│时间│  │ 变量列表           │
│  │ .. │ .. │ .. │.. │  │ 历史活动           │
│  └────────────────┘  │ [⛔ 终止实例]       │
└──────────────────────┴─────────────────────┘
```

**启动实例弹窗**：

```
┌── 启动新流程实例 ──────────────────────┐
│                                        │
│  流程定义: [请选择... ▼]               │
│  业务 Key: [________________]          │
│                                        │
│  流程变量:                             │
│  [键] [值 (JSON 或字符串)] [+ 添加]    │
│   amount  2000                     ✕   │
│   reason  紧急采购                  ✕   │
│                                        │
│              [取消]  [启动]             │
└────────────────────────────────────────┘
```

**核心交互**：

1. **启动实例**：
   ```typescript
   const inst = await api.instance.start(startKey, businessKey, variables);
   setShowStartModal(false);
   refresh();   // 刷新列表
   ```

2. **选择实例** → 加载历史活动：
   ```typescript
   const acts = await api.instance.activities(inst.id);
   setActivities(acts);
   ```

3. **变量管理**：
   - 添加：`setVariables(prev => ({ ...prev, [varKey]: parsed }))`
   - 删除：`delete next[key]`
   - 值解析：先尝试 `JSON.parse()`，失败则作为字符串

4. **终止实例**：`api.instance.terminate(id)`，仅 ACTIVE 状态可终止

**学习要点**：
- 并行请求优化：`Promise.all([api.process.list(), api.instance.list()])`
- 变量值支持 JSON（如 `{"items":[1,2]}`）和普通字符串，自动解析
- 弹窗点击遮罩层关闭，内部点击不冒泡（`e.stopPropagation()`）

---

## 六、API 客户端

文件：`src/services/api.ts`

### 6.1 axios 实例

```typescript
const http = axios.create({
  baseURL: '/api',    // 所有请求前缀 /api
  timeout: 15000,     // 15 秒超时（BPMN XML 可能较大）
});
```

`baseURL` 设为 `/api`，开发时由 Vite 代理转发到 `http://localhost:3000`，生产环境由 Nginx 反向代理。

### 6.2 API 方法一览

```typescript
export const api = {
  // ─── 健康检查 ───
  health: () => http.get<HealthInfo>('/health').then(r => r.data),

  // ─── 流程定义 ───
  process: {
    deploy: (xml: string, name: string) =>
      http.post<ProcessDefinition>('/process/deploy', { xml, name }).then(r => r.data),
    list: () =>
      http.get<ProcessDefinition[]>('/process/definitions').then(r => r.data),
    get: (id: string) =>
      http.get<ProcessDefinition>(`/process/definitions/${id}`).then(r => r.data),
  },

  // ─── 流程实例 ───
  instance: {
    start: (definitionKey, businessKey?, variables?) =>
      http.post<ProcessInstance>('/instance', { definitionKey, businessKey, variables }).then(r => r.data),
    list: () =>
      http.get<ProcessInstance[]>('/instance').then(r => r.data),
    get: (id: string) =>
      http.get<ProcessInstance>(`/instance/${id}`).then(r => r.data),
    terminate: (id: string) =>
      http.delete(`/instance/${id}`),
    activities: (id: string) =>
      http.get<HistoricActivityInstance[]>(`/instance/${id}/activities`).then(r => r.data),
  },

  // ─── 任务 ───
  task: {
    list: (opts?) =>
      http.get<UserTask[]>('/task', { params: opts }).then(r => r.data),
    get: (id: string) =>
      http.get<UserTask>(`/task/${id}`).then(r => r.data),
    complete: (id: string, variables?) =>
      http.post(`/task/${id}/complete`, { variables }),
    assign: (id: string, assignee: string) =>
      http.put(`/task/${id}/assignee`, { assignee }),
    comment: (id: string, userId: string, message: string) =>
      http.post<TaskComment>(`/task/${id}/comment`, { userId, message }).then(r => r.data),
    comments: (id: string) =>
      http.get<TaskComment[]>(`/task/${id}/comments`).then(r => r.data),
  },
};
```

**设计模式**：命名空间对象（Namespace Object），按资源分组（`process` / `instance` / `task`），方法名语义化。

**统一响应处理**：所有方法通过 `.then(r => r.data)` 自动解包 axios 响应，调用方直接拿到业务数据。

---

## 七、类型定义

文件：`src/types/bpmn.ts`

与后端 `backend/src/types.ts` 保持一致：

```typescript
// 流程定义
export interface ProcessDefinition {
  id: string;              // 定义 ID
  key: string;             // 流程 Key（如 "leave_request"）
  name: string;            // 流程名称
  version: number;         // 版本号
  deploymentId: string;    // 部署 ID
  resourceName: string;    // 资源文件名
  xml: string;             // BPMN XML 内容
  deployedAt: string;      // 部署时间
}

// 流程实例
export interface ProcessInstance {
  id: string;
  processDefinitionId: string;
  processDefinitionKey: string;
  businessKey?: string;         // 业务标识
  name?: string;
  variables: Record<string, any>;  // 流程变量
  startTime: string;
  endTime?: string;
  state: 'ACTIVE' | 'COMPLETED' | 'TERMINATED' | 'SUSPENDED';
  currentActivityIds?: string[];   // 当前活动节点 ID 列表
}

// 用户任务
export interface UserTask {
  id: string;
  name: string;
  processInstanceId: string;
  processDefinitionKey: string;
  taskDefinitionKey: string;     // BPMN 中定义的任务 ID
  assignee?: string;             // 负责人
  owner?: string;
  candidateGroups?: string[];    // 候选组
  priority: number;
  createTime: string;
  dueDate?: string;
  formKey?: string;              // 表单 Key（用于动态表单）
  variables: Record<string, any>;
  description?: string;
}

// 任务评论
export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  message: string;
  created: string;
  type: 'comment' | 'event';
}

// 历史活动实例
export interface HistoricActivityInstance {
  id: string;
  processInstanceId: string;
  activityId: string;            // 活动 ID（对应 BPMN 中的元素 ID）
  activityName: string;
  activityType: string;          // 类型：startEvent / userTask / endEvent / ...
  taskDefinitionKey?: string;
  startTime: string;
  endTime?: string;              // 有值 = 已完成，无值 = 进行中
  duration?: number;
  state: 'ACTIVE' | 'COMPLETED';
}

// 健康检查
export interface HealthInfo {
  ok: boolean;
  engine: string;
  mode: string;
  port: number;
}
```

**`state` 字段是核心状态机**：

```
ProcessInstance:  ACTIVE → COMPLETED / TERMINATED / SUSPENDED
HistoricActivityInstance:  ACTIVE → COMPLETED
```

---

## 八、样式体系

文件：`src/styles.css`（750+ 行）

### 8.1 CSS 变量

```css
:root {
  /* ── 暗色主题 ── */
  --bg: #1a1d23;               /* 主背景 */
  --bg-card: #242830;          /* 卡片 */
  --bg-elevated: #2d323c;      /* 浮层/高亮 */
  --border: #3a3f4b;           /* 边框 */
  --text: #e4e6eb;             /* 主文字 */
  --text-muted: #9aa0aa;       /* 次要文字 */

  /* ── 语义色 ── */
  --accent: #4a9eff;           /* 主题蓝 */
  --accent-hover: #3b8de6;
  --success: #4caf50;          /* 绿 */
  --warning: #ff9800;          /* 橙 */
  --error: #f44336;            /* 红 */

  /* ── BPMN 画布（浅色，业界惯例）── */
  --canvas-bg: #f5f6f8;
  --canvas-grid: #e1e4e8;
}
```

### 8.2 整体布局

```css
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;              /* 满屏 */
}

.app-header { height: 56px; flex-shrink: 0; }
.app-content { flex: 1; overflow: hidden; }
```

### 8.3 组件样式分类

| 分类 | CSS 类 | 用途 |
|---|---|---|
| **按钮** | `.btn` `.btn-primary` `.btn-danger` `.btn-success` | 四种按钮风格 |
| **输入** | `.input` `.select` `.textarea` | 表单控件 |
| **表格** | `.table` | 实例列表 |
| **状态徽标** | `.badge-active` `.badge-completed` `.badge-terminated` `.badge-suspended` | 实例状态 |
| **布局** | `.page` `.toolbar` `.editor-layout` `.editor-canvas` `.editor-sidebar` | 页面结构 |
| **任务** | `.task-card` `.task-detail` `.task-detail-section` | 任务面板 |
| **弹窗** | `.modal-overlay` `.modal` `.modal-title` `.modal-actions` | 模态框 |
| **变量** | `.variables-list` `.var-item` `.var-key` `.var-value` | 变量展示 |
| **通知** | `.toast-container` `.toast` `.toast-success/error/warning/info` | Toast |
| **空状态** | `.empty-state` | 列表为空时的占位 |

### 8.4 bpmn-js 样式适配

由于应用是暗色主题，但 bpmn-js 画布需要浅色背景（业界惯例），需要大量覆盖 bpmn-js 内置样式：

**调色板**（左侧工具栏）：
```css
.djs-palette {
  background: #ffffff !important;      /* 白色背景 */
  border: 1px solid #d0d4d9 !important;
  box-shadow: 2px 2px 8px rgba(0,0,0,0.1);
}
```

**画布网格背景**：
```css
.editor-canvas {
  background: var(--canvas-bg);  /* #f5f6f8 */
  background-image:
    linear-gradient(to right, var(--canvas-grid) 1px, transparent 1px),
    linear-gradient(to bottom, var(--canvas-grid) 1px, transparent 1px);
  background-size: 20px 20px;   /* 20px 间距的网格线 */
}
```

**选中高亮**：
```css
.djs-element.selected .djs-visual > * {
  stroke: var(--accent) !important;   /* 蓝色选中 */
  stroke-width: 2.5px !important;
}
```

**连接线**：
```css
.djs-connection .djs-visual path {
  stroke: #4a4f5a !important;   /* 深灰色连线，在白底上清晰 */
  stroke-width: 1.5px !important;
}
```

**右键菜单**：
```css
.djs-context-pad {
  background: #ffffff !important;
  border: 1px solid #d0d4d9 !important;
  border-radius: 4px !important;
}
```

> **为什么用 `!important`？** bpmn-js 的 CSS 优先级很高（如 `.djs-palette .entry { background: url(...) }` 使用背景图图标），必须 `!important` 才能覆盖。

---

## 九、数据流全图

```
┌─────────────────────────────────────────────────────────┐
│                        前端                               │
│                                                           │
│  ModelerPage ──deploy──→ api.process.deploy(xml, name)   │
│                           │                               │
│  InstancesPage ──start──→ api.instance.start(key, ...)   │
│                           │                               │
│  TaskPage ──complete───→ api.task.complete(id, vars)     │
│        ├── assign ────→ api.task.assign(id, assignee)    │
│        └── comment ───→ api.task.comment(id, userId, msg)│
│                                                           │
│  api.ts (axios) ──→ /api/* ──→ Vite proxy ──→ :3000     │
└───────────────────────────────────────────────────────────┘
```

**典型完整操作链**：

```
1. ModelerPage:  画流程图 → saveXML() → deploy(xml, name)  →  后端存储流程定义
2. InstancesPage:  选择流程 → start(key, vars)             →  后端创建实例
3. TaskPage:  查看任务 → complete(id)                       →  后端推进流程
4. InstancesPage:  查看实例 → activities(id)                →  后端返回历史
```

---

## 十、组件间通信模式

### 10.1 父 → 子：命令式（Ref）

`ModelerPage` 通过 `useRef<BpmnEditorHandle>` 操控 `BpmnEditor`：

```typescript
// 父组件
const editorRef = useRef<BpmnEditorHandle>(null);

// 调用子组件方法
const xml = await editorRef.current.saveXML();
await editorRef.current.loadXML(def.xml);
editorRef.current.clear();
```

### 10.2 子 → 父：回调（Props）

`BpmnEditor` 通过 `onChange` prop 将 XML 变更通知父组件：

```typescript
// 父组件
<BpmnEditor ref={editorRef} onChange={setCurrentXml} />

// 子组件内部
modeler.on('element.changed', () => {
  modelerRef.current.saveXML().then(({ xml }) => {
    if (newXml) onChange(newXml);
  });
});
```

### 10.3 跨组件：Context（Toast）

`Toast` 使用 React Context，任何深层组件都能调用 `useToast()`：

```typescript
// 在 App.tsx 中包裹
<ToastProvider>
  <Routes>...</Routes>
</ToastProvider>

// 在任何页面中使用
const { showToast } = useToast();
showToast('部署成功', 'success');
```

### 10.4 服务层：单例对象

`api.ts` 导出一个单例对象，所有页面共享同一个 axios 实例和统一配置。

---

## 十一、bpmn-js 进阶知识

### 11.1 架构

bpmn-js 是基于 [diagram-js](https://github.com/bpmn-io/diagram-js) 构建的：

```
bpmn-js
├── diagram-js        # 画布、事件、命令栈、选择、调色板等基础设施
├── bpmn-moddle       # BPMN 2.0 XML 元模型（定义了哪些元素、属性合法）
└── bpmn-js 特有模块  # BPMN 规则、BPMN 调色板、BPMN 上下文菜单等
```

### 11.2 Modeler vs Viewer vs NavigatedViewer

| 类 | 功能 | 用途 |
|---|---|---|
| `Modeler` | 可编辑 | 流程建模 |
| `Viewer` | 只读渲染 | 流程查看 |
| `NavigatedViewer` | 只读 + 缩放/平移 | 大图浏览 |

本项目在 `BpmnEditor` 中使用 `Modeler`。如需只读查看流程图，可替换为 `Viewer`：

```typescript
import BpmnViewer from 'bpmn-js/lib/Viewer';
const viewer = new BpmnViewer({ container });
viewer.importXML(xml);
```

### 11.3 常用 API

```typescript
// 获取内部服务
const canvas = modeler.get('canvas');       // 画布控制
const elementRegistry = modeler.get('elementRegistry');  // 元素注册表
const selection = modeler.get('selection');  // 选择管理
const commandStack = modeler.get('commandStack');  // 命令栈（撤销/重做）

// 画布操作
canvas.zoom('fit-viewport');   // 自适应缩放
canvas.zoom(1.5);             // 缩放到 150%
canvas.scrollCenter();        // 居中

// 元素操作
const elements = elementRegistry.getAll();
const startEvents = elementRegistry.filter(e => e.type === 'bpmn:StartEvent');

// 事件监听
modeler.on('selection.changed', ({ newSelection }) => { ... });
modeler.on('commandStack.changed', () => { ... });   // 撤销/重做时触发
```

### 11.4 CSS 样式导入

使用 bpmn-js 必须导入其样式文件：

```typescript
import 'bpmn-js/dist/assets/diagram-js.css';      // 画布基础样式
import 'bpmn-js/dist/assets/bpmn-js.css';          // BPMN 特有样式
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';  // BPMN 图标字体
```

缺少任何一个都会导致画布渲染异常。

---

## 十二、调试技巧

### 12.1 查看 API 请求

浏览器 DevTools → Network → 筛选 `XHR`，所有 `/api/` 请求都可查看参数和响应。

### 12.2 查看 bpmn-js 内部状态

在浏览器控制台中：

```javascript
// 获取 Modeler 实例（如果 BpmnEditor 已挂载）
// 可以在 React DevTools 中找到 BpmnEditor 的 ref

// 或在代码中临时暴露到 window
// window.__modeler = modeler;

const modeler = window.__modeler;
modeler.get('elementRegistry').getAll();         // 所有元素
modeler.get('commandStack').undo();              // 撤销
modeler.get('canvas').zoom('fit-viewport');      // 自适应
```

### 12.3 Vite 代理排错

如果 API 404，检查：
1. 后端是否运行在 `:3000`
2. Vite 终端是否显示代理错误
3. `vite.config.ts` 中 `proxy` 配置是否正确

### 12.4 bpmn-js 导入失败

如果画布空白，常见原因：
- 缺少 CSS 导入（三个 `import` 语句）
- `bpmn-js` 包未安装或版本不兼容
- XML 格式错误（缺少 `<bpmndi:BPMNDiagram>` 图形信息）

---

## 十三、扩展前端的前 N 步

### 1. 添加只读流程查看器

在 `InstancesPage` 中嵌入 `BpmnViewer`，高亮当前活动节点：

```typescript
import BpmnViewer from 'bpmn-js/lib/Viewer';
const viewer = new BpmnViewer({ container });
await viewer.importXML(xml);

// 高亮当前节点
const overlays = viewer.get('overlays');
overlays.add(activityId, {
  position: { top: -10, left: -10 },
  html: '<div class="highlight-dot"></div>',
});
```

### 2. 添加 bpmn-js-properties-panel

让用户点击元素时弹出属性编辑面板：

```typescript
import BpmnPropertiesPanel from 'bpmn-js-properties-panel';
import BpmnPropertiesProvider from 'bpmn-js-properties-panel/lib/provider/bpmn';

const modeler = new BpmnModeler({
  container: containerRef.current,
  propertiesPanel: { parent: propertiesPanelRef.current },
  additionalModules: [BpmnPropertiesProvider],
});
```

### 3. 添加错误边界

包裹 `BpmnEditor` 防止 bpmn-js 崩溃导致整个应用白屏：

```typescript
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <div>建模器异常: {this.state.error.message}</div>;
    return this.props.children;
  }
}
```

### 4. 添加请求拦截器

在 `api.ts` 中统一处理错误和认证：

```typescript
http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // 跳转到登录页
    }
    return Promise.reject(error);
  }
);
```

### 5. 添加 Loading 状态

列表加载时显示骨架屏或 Spinner，提升用户体验。

---

## 十四、推荐学习路径

```
1.  types/bpmn.ts         → 理解数据模型（所有页面共用）
2.  services/api.ts        → 理解 API 调用（所有页面的数据来源）
3.  main.tsx + App.tsx     → 理解应用入口和路由
4.  components/Toast.tsx   → 理解 Context + 自定义 Hook 模式
5.  components/Header.tsx  → 理解导航 + 健康检查
6.  components/BpmnEditor.tsx  → 理解 bpmn-js 集成（重点）
7.  pages/ModelerPage.tsx  → 理解 forwardRef + useImperativeHandle
8.  pages/TaskPage.tsx     → 理解列表 + 详情 + 操作面板
9.  pages/InstancesPage.tsx → 理解表格 + 弹窗 + 变量管理
10. styles.css             → 理解 CSS 变量体系和 bpmn-js 适配
11. vite.config.ts         → 理解代理配置
```
