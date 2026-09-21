import fetch from 'node-fetch';
import { config } from '../config.js';
import type {
  ProcessDefinition,
  ProcessInstance,
  UserTask,
  TaskComment,
  HistoricActivityInstance,
} from '../types.js';
import type { FlowableClient } from './flowable.js';

// 调用真实 Flowable 引擎 REST API
// Flowable 默认启用 REST API 在 :8080

export class FlowableRestClient implements FlowableClient {
  private baseUrl: string;
  private auth: string;

  constructor() {
    this.baseUrl = config.flowable.url.replace(/\/$/, '');
    this.auth = Buffer.from(
      `${config.flowable.user}:${config.flowable.password}`,
    ).toString('base64');
    console.log(`[FlowableRest] 连接 ${this.baseUrl}`);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Basic ${this.auth}`,
    };

    const resp = await fetch(url, {
      method,
      headers: h,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Flowable ${resp.status}: ${text}`);
    }
    return (await resp.json()) as T;
  }

  async deploy(xml: string, name: string): Promise<ProcessDefinition> {
    const fd = new FormData();
    fd.append('filesToDeploy', new Blob([xml], { type: 'text/xml' }), 'process.bpmn');

    const resp = await fetch(`${this.baseUrl}/repository/deployments`, {
      method: 'POST',
      headers: { Authorization: `Basic ${this.auth}` },
      body: fd,
    });
    if (!resp.ok) {
      throw new Error(`Deploy failed: ${await resp.text()}`);
    }
    const deployment: any = await resp.json();
    const defs = await this.request<any[]>(
      'GET',
      `/repository/deployments/${deployment.id}/process-definitions`,
    );
    const def = defs[0];
    return this.mapDefinition(def, xml);
  }

  async listDefinitions(): Promise<ProcessDefinition[]> {
    const list = await this.request<any[]>('GET', '/repository/process-definitions?latest=true');
    return list.map(d => this.mapDefinition(d));
  }

  async getDefinition(id: string): Promise<ProcessDefinition | null> {
    try {
      const def = await this.request<any>('GET', `/repository/process-definitions/${id}`);
      return this.mapDefinition(def);
    } catch {
      return null;
    }
  }

  async startInstance(
    definitionKey: string,
    businessKey?: string,
    variables?: Record<string, any>,
  ): Promise<ProcessInstance> {
    const body = {
      definitionKey,
      businessKey,
      variables: variables || {},
    };
    const inst = await this.request<any>('POST', '/runtime/process-instances', body);
    return this.mapInstance(inst);
  }

  async listInstances(): Promise<ProcessInstance[]> {
    const list = await this.request<any[]>('GET', '/runtime/process-instances');
    return list.map(i => this.mapInstance(i));
  }

  async getInstance(id: string): Promise<ProcessInstance | null> {
    try {
      const inst = await this.request<any>('GET', `/runtime/process-instances/${id}`);
      return this.mapInstance(inst);
    } catch {
      return null;
    }
  }

  async terminateInstance(id: string): Promise<void> {
    await this.request(
      'DELETE',
      `/runtime/process-instances/${id}`,
      { deleteReason: 'Terminated by user' },
    );
  }

  async listTasks(opts?: {
    processInstanceId?: string;
    assignee?: string;
  }): Promise<UserTask[]> {
    const params = new URLSearchParams();
    if (opts?.processInstanceId) params.set('processInstanceId', opts.processInstanceId);
    if (opts?.assignee) params.set('assignee', opts.assignee);
    const query = params.toString() ? `?${params.toString()}` : '';
    const list = await this.request<any[]>('GET', `/task${query}`);
    return list.map(t => this.mapTask(t));
  }

  async getTask(id: string): Promise<UserTask | null> {
    try {
      const task = await this.request<any>('GET', `/task/${id}`);
      return this.mapTask(task);
    } catch {
      return null;
    }
  }

  async completeTask(
    id: string,
    variables?: Record<string, any>,
  ): Promise<void> {
    await this.request('POST', `/task/${id}/complete`, {
      variables: variables || {},
    });
  }

  async assignTask(id: string, assignee: string): Promise<void> {
    await this.request('PUT', `/task/${id}/assignee`, { userId: assignee });
  }

  async addComment(
    taskId: string,
    userId: string,
    message: string,
  ): Promise<TaskComment> {
    const comment = await this.request<any>('POST', `/task/${taskId}/comment`, {
      userId,
      message,
    });
    return {
      id: comment.id,
      taskId,
      userId,
      message,
      created: new Date().toISOString(),
      type: 'comment',
    };
  }

  async listComments(taskId: string): Promise<TaskComment[]> {
    const list = await this.request<any[]>('GET', `/task/${taskId}/comment`);
    return list.map(c => ({
      id: c.id,
      taskId,
      userId: c.userId,
      message: c.message,
      created: c.created || new Date().toISOString(),
      type: 'comment',
    }));
  }

  async getHistoricActivities(
    processInstanceId: string,
  ): Promise<HistoricActivityInstance[]> {
    const list = await this.request<any[]>('GET',
      `/history/activity-instances?processInstanceId=${processInstanceId}`,
    );
    return list.map(a => ({
      id: a.id,
      processInstanceId,
      activityId: a.activityId,
      activityName: a.activityName,
      activityType: a.activityType,
      taskDefinitionKey: a.taskDefinitionKey,
      startTime: a.startTime,
      endTime: a.endTime,
      duration: a.duration,
      state: a.endTime ? 'COMPLETED' : 'ACTIVE',
    }));
  }

  async health(): Promise<{ ok: boolean; engine: string }> {
    try {
      await this.request<any[]>('GET', '/repository/deployments');
      return { ok: true, engine: 'flowable' };
    } catch {
      return { ok: false, engine: 'flowable' };
    }
  }

  private mapDefinition(def: any, xml?: string): ProcessDefinition {
    return {
      id: def.id,
      key: def.key,
      name: def.name,
      version: def.version,
      deploymentId: def.deploymentId,
      resourceName: def.resourceName,
      diagramId: def.diagramId,
      xml: xml || '',
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
      state: inst.endTime ? 'COMPLETED' : 'ACTIVE',
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
}
