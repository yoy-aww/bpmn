import type {
  ProcessDefinition,
  ProcessInstance,
  UserTask,
  TaskComment,
  HistoricActivityInstance,
} from '../types.js';

// Flowable 客户端统一接口
// mockFlowable.ts 和 flowableRest.ts 都要实现这个接口
export interface FlowableClient {
  // 部署
  deploy(xml: string, name: string): Promise<ProcessDefinition>;
  listDefinitions(): Promise<ProcessDefinition[]>;
  getDefinition(id: string): Promise<ProcessDefinition | null>;

  // 流程实例
  startInstance(
    definitionKey: string,
    businessKey?: string,
    variables?: Record<string, any>,
  ): Promise<ProcessInstance>;
  listInstances(): Promise<ProcessInstance[]>;
  getInstance(id: string): Promise<ProcessInstance | null>;
  terminateInstance(id: string): Promise<void>;

  // 任务
  listTasks(opts?: {
    processInstanceId?: string;
    assignee?: string;
  }): Promise<UserTask[]>;
  getTask(id: string): Promise<UserTask | null>;
  completeTask(
    id: string,
    variables?: Record<string, any>,
  ): Promise<void>;
  assignTask(id: string, assignee: string): Promise<void>;

  // 评论
  addComment(taskId: string, userId: string, message: string): Promise<TaskComment>;
  listComments(taskId: string): Promise<TaskComment[]>;

  // 历史
  getHistoricActivities(
    processInstanceId: string,
  ): Promise<HistoricActivityInstance[]>;

  // 健康检查
  health(): Promise<{ ok: boolean; engine: string }>;
}
