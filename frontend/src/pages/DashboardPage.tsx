import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import type { ProcessDefinition, ProcessInstance, UserTask } from '../types/bpmn';

export default function DashboardPage() {
  const { showToast } = useToast();
  const [definitions, setDefinitions] = useState<ProcessDefinition[]>([]);
  const [instances, setInstances] = useState<ProcessInstance[]>([]);
  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      setLoading(true);
      const [defs, insts, tks] = await Promise.all([
        api.process.list(),
        api.instance.list(),
        api.task.list(),
      ]);
      setDefinitions(defs);
      setInstances(insts);
      setTasks(tks);
    } catch (err: any) {
      showToast(`加载失败: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const activeInstances = instances.filter(i => i.state === 'ACTIVE');
  const unassignedTasks = tasks.filter(t => !t.assignee);
  const recentDefinitions = [...definitions].sort((a, b) =>
    new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime()
  ).slice(0, 5);
  const recentInstances = [...instances].sort((a, b) =>
    new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  ).slice(0, 5);

  return (
    <div className="dashboard">
      {/* 统计卡片 */}
      <div className="dashboard-stats">
        <div className="stat-card">
          <div className="stat-icon">📋</div>
          <div className="stat-info">
            <div className="stat-number">{loading ? '...' : definitions.length}</div>
            <div className="stat-label">流程定义</div>
          </div>
          <Link to="/modeler" className="stat-link">
            管理 →
          </Link>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🔄</div>
          <div className="stat-info">
            <div className="stat-number">{loading ? '...' : activeInstances.length}</div>
            <div className="stat-label">运行中实例</div>
          </div>
          <Link to="/instances" className="stat-link">
            查看 →
          </Link>
        </div>

        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-info">
            <div className="stat-number">{loading ? '...' : tasks.length}</div>
            <div className="stat-label">待办任务</div>
          </div>
          <Link to="/tasks" className="stat-link">
            处理 →
          </Link>
        </div>

        <div className="stat-card">
          <div className="stat-icon">👤</div>
          <div className="stat-info">
            <div className="stat-number">{loading ? '...' : unassignedTasks.length}</div>
            <div className="stat-label">未指派任务</div>
          </div>
          <Link to="/tasks" className="stat-link">
            指派 →
          </Link>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="dashboard-content">
        {/* 快速操作 */}
        <div className="dashboard-panel">
          <div className="panel-title">快速操作</div>
          <div className="quick-actions">
            <Link to="/modeler" className="quick-action">
              <span className="quick-action-icon">📝</span>
              <div>
                <div className="quick-action-title">建模部署</div>
                <div className="quick-action-desc">设计并部署 BPMN 流程</div>
              </div>
            </Link>
            <Link to="/instances" className="quick-action">
              <span className="quick-action-icon">🚀</span>
              <div>
                <div className="quick-action-title">启动实例</div>
                <div className="quick-action-desc">启动新的流程实例</div>
              </div>
            </Link>
            <Link to="/tasks" className="quick-action">
              <span className="quick-action-icon">✅</span>
              <div>
                <div className="quick-action-title">处理任务</div>
                <div className="quick-action-desc">处理待办任务</div>
              </div>
            </Link>
          </div>
        </div>

        {/* 最近流程定义 */}
        <div className="dashboard-panel">
          <div className="panel-header">
            <div className="panel-title">最近部署的流程</div>
            <Link to="/modeler" className="panel-link">全部 →</Link>
          </div>
          {recentDefinitions.length === 0 ? (
            <div className="empty-hint">暂无已部署的流程</div>
          ) : (
            <div className="item-list">
              {recentDefinitions.map(def => (
                <div key={def.id} className="item-row">
                  <span className="item-icon">📋</span>
                  <div className="item-content">
                    <div className="item-title">{def.name}</div>
                    <div className="item-meta">
                      {def.key} · v{def.version} · {new Date(def.deployedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 最近实例 */}
        <div className="dashboard-panel">
          <div className="panel-header">
            <div className="panel-title">最近流程实例</div>
            <Link to="/instances" className="panel-link">全部 →</Link>
          </div>
          {recentInstances.length === 0 ? (
            <div className="empty-hint">暂无流程实例</div>
          ) : (
            <div className="item-list">
              {recentInstances.map(inst => (
                <div key={inst.id} className="item-row">
                  <span className="item-icon">
                    {inst.state === 'ACTIVE' ? '🟢' : inst.state === 'COMPLETED' ? '🔵' : '🔴'}
                  </span>
                  <div className="item-content">
                    <div className="item-title">
                      {inst.name || inst.processDefinitionKey}
                    </div>
                    <div className="item-meta">
                      <span className={`badge badge-${inst.state.toLowerCase()}`}>
                        {inst.state}
                      </span>
                      {' '}· {new Date(inst.startTime).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
