import axios from 'axios';
import type {
  HealthInfo,
  ProcessDefinition,
  ProcessInstance,
  UserTask,
  TaskComment,
  HistoricActivityInstance,
} from '../types/bpmn';

const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

export const api = {
  // 健康检查
  health: () => http.get<HealthInfo>('/health').then(r => r.data),

  // 流程定义
  process: {
    deploy: (xml: string, name: string) =>
      http.post<ProcessDefinition>('/process/deploy', { xml, name }).then(r => r.data),
    list: () => http.get<ProcessDefinition[]>('/process/definitions').then(r => r.data),
    get: (id: string) => http.get<ProcessDefinition>(`/process/definitions/${id}`).then(r => r.data),
  },

  // 流程实例
  instance: {
    start: (definitionKey: string, businessKey?: string, variables?: Record<string, any>) =>
      http.post<ProcessInstance>('/instance', { definitionKey, businessKey, variables }).then(r => r.data),
    list: () => http.get<ProcessInstance[]>('/instance').then(r => r.data),
    get: (id: string) => http.get<ProcessInstance>(`/instance/${id}`).then(r => r.data),
    terminate: (id: string) => http.delete(`/instance/${id}`),
    activities: (id: string) =>
      http.get<HistoricActivityInstance[]>(`/instance/${id}/activities`).then(r => r.data),
  },

  // 任务
  task: {
    list: (opts?: { processInstanceId?: string; assignee?: string }) =>
      http.get<UserTask[]>('/task', { params: opts }).then(r => r.data),
    get: (id: string) => http.get<UserTask>(`/task/${id}`).then(r => r.data),
    complete: (id: string, variables?: Record<string, any>) =>
      http.post(`/task/${id}/complete`, { variables }),
    assign: (id: string, assignee: string) =>
      http.put(`/task/${id}/assignee`, { assignee }),
    comment: (id: string, userId: string, message: string) =>
      http.post<TaskComment>(`/task/${id}/comment`, { userId, message }).then(r => r.data),
    comments: (id: string) => http.get<TaskComment[]>(`/task/${id}/comments`).then(r => r.data),
  },
};
