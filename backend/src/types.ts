// 流程定义
export interface ProcessDefinition {
  id: string;
  key: string;
  name: string;
  version: number;
  deploymentId: string;
  resourceName: string;
  diagramId?: string;
  xml: string;
  deployedAt: string;
}

// 流程实例
export interface ProcessInstance {
  id: string;
  processDefinitionId: string;
  processDefinitionKey: string;
  businessKey?: string;
  name?: string;
  variables: Record<string, any>;
  startTime: string;
  endTime?: string;
  state: 'ACTIVE' | 'COMPLETED' | 'TERMINATED' | 'SUSPENDED';
  currentActivityIds?: string[];
}

// 用户任务
export interface UserTask {
  id: string;
  name: string;
  processInstanceId: string;
  processDefinitionKey: string;
  taskDefinitionKey: string;
  assignee?: string;
  owner?: string;
  candidateGroups?: string[];
  priority: number;
  createTime: string;
  dueDate?: string;
  formKey?: string;
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
  activityId: string;
  activityName: string;
  activityType: string;
  taskDefinitionKey?: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  state: 'ACTIVE' | 'COMPLETED';
}
