import { randomUUID } from 'node:crypto';
import type {
  ProcessDefinition,
  ProcessInstance,
  UserTask,
  TaskComment,
  HistoricActivityInstance,
} from '../types.js';
import type { FlowableClient } from './flowable.js';

// 内存 Mock 实现
// 用于无 Docker 环境，让前端能开箱即用
// 注意：数据在进程重启后丢失，仅用于学习和演示

export class MockFlowableClient implements FlowableClient {
  private definitions = new Map<string, ProcessDefinition>();
  private instances = new Map<string, ProcessInstance>();
  private tasks = new Map<string, UserTask>();
  private comments = new Map<string, TaskComment[]>();
  private activities = new Map<string, HistoricActivityInstance[]>();
  private deployCounter = 0;

  constructor() {
    console.log('[MockFlowable] 内存 Mock 模式启动，所有数据存在进程内存中');
  }

  async deploy(xml: string, name: string): Promise<ProcessDefinition> {
    this.deployCounter++;
    const defId = `def-${Date.now()}`;
    const def: ProcessDefinition = {
      id: defId,
      key: this.extractProcessKey(xml) || name,
      name,
      version: this.deployCounter,
      deploymentId: `deploy-${Date.now()}`,
      resourceName: `${name}.bpmn`,
      xml,
      deployedAt: new Date().toISOString(),
    };
    this.definitions.set(defId, def);
    console.log(`[MockFlowable] 部署流程定义: ${name} -> ${defId}`);
    return def;
  }

  async listDefinitions(): Promise<ProcessDefinition[]> {
    return Array.from(this.definitions.values());
  }

  async getDefinition(id: string): Promise<ProcessDefinition | null> {
    return this.definitions.get(id) || null;
  }

  async startInstance(
    definitionKey: string,
    businessKey?: string,
    variables?: Record<string, any>,
  ): Promise<ProcessInstance> {
    // 找到第一个匹配的 definition（简化逻辑）
    const def = Array.from(this.definitions.values()).find(
      d => d.key === definitionKey,
    );
    if (!def) {
      throw new Error(`未找到流程定义: ${definitionKey}`);
    }

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

    // 创建一个初始活动记录
    this.activities.set(instance.id, [
      {
        id: randomUUID(),
        processInstanceId: instance.id,
        activityId: 'StartEvent_1',
        activityName: '开始',
        activityType: 'startEvent',
        startTime: instance.startTime,
        state: 'COMPLETED',
      },
    ]);

    console.log(`[MockFlowable] 启动实例: ${instance.id}`);
    return instance;
  }

  async listInstances(): Promise<ProcessInstance[]> {
    return Array.from(this.instances.values());
  }

  async getInstance(id: string): Promise<ProcessInstance | null> {
    return this.instances.get(id) || null;
  }

  async terminateInstance(id: string): Promise<void> {
    const inst = this.instances.get(id);
    if (!inst) throw new Error(`实例不存在: ${id}`);
    inst.state = 'TERMINATED';
    inst.endTime = new Date().toISOString();
  }

  async listTasks(opts?: {
    processInstanceId?: string;
    assignee?: string;
  }): Promise<UserTask[]> {
    let all = Array.from(this.tasks.values());
    if (opts?.processInstanceId) {
      all = all.filter(t => t.processInstanceId === opts.processInstanceId);
    }
    if (opts?.assignee) {
      all = all.filter(t => t.assignee === opts.assignee);
    }
    return all;
  }

  async getTask(id: string): Promise<UserTask | null> {
    return this.tasks.get(id) || null;
  }

  async completeTask(
    id: string,
    variables?: Record<string, any>,
  ): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`任务不存在: ${id}`);

    // 合并变量
    if (variables) {
      Object.assign(task.variables, variables);

      // 同步到实例变量
      const inst = this.instances.get(task.processInstanceId);
      if (inst) {
        Object.assign(inst.variables, variables);
      }
    }

    // 移除任务
    this.tasks.delete(id);

    // 记录历史活动
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

    // 检查实例是否还有任务，如果没有则完成实例
    const remainingTasks = Array.from(this.tasks.values()).filter(
      t => t.processInstanceId === task.processInstanceId,
    );
    if (remainingTasks.length === 0) {
      const inst = this.instances.get(task.processInstanceId);
      if (inst) {
        inst.state = 'COMPLETED';
        inst.endTime = new Date().toISOString();
        // 记录结束事件
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
        this.activities.set(inst.id, acts);
      }
    }

    console.log(`[MockFlowable] 完成任务: ${id}`);
  }

  async assignTask(id: string, assignee: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`任务不存在: ${id}`);
    task.assignee = assignee;
  }

  async addComment(
    taskId: string,
    userId: string,
    message: string,
  ): Promise<TaskComment> {
    const comment: TaskComment = {
      id: randomUUID(),
      taskId,
      userId,
      message,
      created: new Date().toISOString(),
      type: 'comment',
    };
    const list = this.comments.get(taskId) || [];
    list.push(comment);
    this.comments.set(taskId, list);
    return comment;
  }

  async listComments(taskId: string): Promise<TaskComment[]> {
    return this.comments.get(taskId) || [];
  }

  async getHistoricActivities(
    processInstanceId: string,
  ): Promise<HistoricActivityInstance[]> {
    return this.activities.get(processInstanceId) || [];
  }

  async health(): Promise<{ ok: boolean; engine: string }> {
    return { ok: true, engine: 'mock-flowable' };
  }

  // 测试辅助：向实例注入任务
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
    Object.assign(newTask, task);
    this.tasks.set(newTask.id, newTask);
    return newTask;
  }

  private extractProcessKey(xml: string): string | null {
    const match = xml.match(/<bpmn:process\s+id="([^"]+)"/);
    return match?.[1] || null;
  }

  private extractStartEvents(_xml: string): string[] {
    return ['StartEvent_1'];
  }
}
