// BPMN 类型定义
export interface ProcessDefinition {
  id: string;
  key: string;
  name: string;
  version: number;
  deploymentId: string;
  resourceName: string;
  xml: string;
  deployedAt: string;
}

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

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  message: string;
  created: string;
  type: 'comment' | 'event';
}

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

export interface HealthInfo {
  ok: boolean;
  engine: string;
  mode: string;
  port: number;
}
