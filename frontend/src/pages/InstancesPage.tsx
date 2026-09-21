import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import type { ProcessDefinition, ProcessInstance, HistoricActivityInstance } from '../types/bpmn';

export default function InstancesPage() {
  const { showToast } = useToast();
  const [definitions, setDefinitions] = useState<ProcessDefinition[]>([]);
  const [instances, setInstances] = useState<ProcessInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<ProcessInstance | null>(null);
  const [activities, setActivities] = useState<HistoricActivityInstance[]>([]);
  const [showStartModal, setShowStartModal] = useState(false);
  const [startKey, setStartKey] = useState('');
  const [businessKey, setBusinessKey] = useState('');
  const [varKey, setVarKey] = useState('');
  const [varValue, setVarValue] = useState('');
  const [variables, setVariables] = useState<Record<string, any>>({});

  const refresh = async () => {
    try {
      const [defs, insts] = await Promise.all([api.process.list(), api.instance.list()]);
      setDefinitions(defs);
      setInstances(insts);
    } catch (err: any) {
      showToast(`加载失败: ${err.message}`, 'error');
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleSelectInstance = async (inst: ProcessInstance) => {
    setSelectedInstance(inst);
    try {
      const acts = await api.instance.activities(inst.id);
      setActivities(acts);
    } catch {
      setActivities([]);
    }
  };

  const handleStart = async () => {
    if (!startKey) {
      showToast('请选择流程定义', 'warning');
      return;
    }
    try {
      const inst = await api.instance.start(startKey, businessKey || undefined, variables);
      showToast(`已启动实例: ${inst.id}`, 'success');
      setShowStartModal(false);
      setStartKey('');
      setBusinessKey('');
      setVariables({});
      refresh();
    } catch (err: any) {
      showToast(`启动失败: ${err.message}`, 'error');
    }
  };

  const handleTerminate = async () => {
    if (!selectedInstance) return;
    try {
      await api.instance.terminate(selectedInstance.id);
      showToast('已终止实例', 'success');
      setSelectedInstance(null);
      refresh();
    } catch (err: any) {
      showToast(`终止失败: ${err.message}`, 'error');
    }
  };

  const addVariable = () => {
    if (!varKey.trim()) return;
    const val = varValue.trim();
    let parsed: any = val;
    try { parsed = JSON.parse(val); } catch { /* keep as string */ }
    setVariables(prev => ({ ...prev, [varKey]: parsed }));
    setVarKey('');
    setVarValue('');
  };

  const removeVariable = (key: string) => {
    setVariables(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  return (
    <div className="page">
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setShowStartModal(true)}>
          🚀 启动新实例
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={refresh}>🔄 刷新</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', padding: 16 }}>
          <div className="section-title" style={{ marginBottom: 12 }}>流程实例</div>
          {instances.length === 0 ? (
            <div className="empty-state">
              <h3>暂无实例</h3>
              <p>点击"启动新实例"开始</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>名称</th>
                  <th>状态</th>
                  <th>启动时间</th>
                </tr>
              </thead>
              <tbody>
                {instances.map(inst => (
                  <tr key={inst.id} onClick={() => handleSelectInstance(inst)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{inst.id.slice(0, 8)}...</td>
                    <td>{inst.name || inst.processDefinitionKey}</td>
                    <td>
                      <span className={`badge badge-${inst.state.toLowerCase()}`}>
                        {inst.state}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {new Date(inst.startTime).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ borderLeft: '1px solid var(--border)', overflow: 'auto', padding: 16 }}>
          {selectedInstance ? (
            <>
              <div className="section-title" style={{ marginBottom: 12 }}>实例详情</div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px', fontSize: 13, marginBottom: 20 }}>
                <span style={{ color: 'var(--text-muted)' }}>ID</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{selectedInstance.id}</span>
                <span style={{ color: 'var(--text-muted)' }}>定义 Key</span>
                <span>{selectedInstance.processDefinitionKey}</span>
                <span style={{ color: 'var(--text-muted)' }}>状态</span>
                <span>
                  <span className={`badge badge-${selectedInstance.state.toLowerCase()}`}>
                    {selectedInstance.state}
                  </span>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>业务 Key</span>
                <span>{selectedInstance.businessKey || '-'}</span>
                <span style={{ color: 'var(--text-muted)' }}>启动时间</span>
                <span>{new Date(selectedInstance.startTime).toLocaleString()}</span>
              </div>

              <div className="section-title" style={{ marginBottom: 8 }}>变量</div>
              <div className="variables-list" style={{ marginBottom: 20 }}>
                {Object.entries(selectedInstance.variables).length === 0 ? (
                  <div style={{ color: 'var(--text-muted)' }}>无变量</div>
                ) : (
                  Object.entries(selectedInstance.variables).map(([k, v]) => (
                    <div key={k} className="var-item">
                      <span className="var-key">{k}</span>
                      <span className="var-value">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="section-title" style={{ marginBottom: 8 }}>历史活动</div>
              <div className="variables-list" style={{ marginBottom: 16 }}>
                {activities.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)' }}>暂无活动</div>
                ) : (
                  activities.map(a => (
                    <div key={a.id} className="var-item">
                      <span className="var-key">{a.activityType}</span>
                      <span className="var-value">
                        {a.activityName || a.activityId}
                        {a.endTime ? ' ✓' : ' ●'}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <button className="btn btn-danger" onClick={handleTerminate} disabled={selectedInstance.state !== 'ACTIVE'}>
                ⛔ 终止实例
              </button>
            </>
          ) : (
            <div className="empty-state">
              <h3>选择左侧实例查看详情</h3>
              <p>可查看变量、历史活动，终止实例</p>
            </div>
          )}
        </div>
      </div>

      {showStartModal && (
        <div className="modal-overlay" onClick={() => setShowStartModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">启动新流程实例</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="label">流程定义</label>
                <select className="select" style={{ width: '100%' }} value={startKey} onChange={e => setStartKey(e.target.value)}>
                  <option value="">请选择...</option>
                  {definitions.map(d => (
                    <option key={d.id} value={d.key}>
                      {d.name} ({d.key}) v{d.version}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">业务 Key (可选)</label>
                <input className="input" style={{ width: '100%' }} value={businessKey} onChange={e => setBusinessKey(e.target.value)} />
              </div>
              <div>
                <label className="label">流程变量</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input className="input" style={{ width: 100 }} placeholder="键" value={varKey} onChange={e => setVarKey(e.target.value)} />
                  <input className="input" style={{ flex: 1 }} placeholder="值 (JSON 或字符串)" value={varValue} onChange={e => setVarValue(e.target.value)} />
                  <button className="btn" onClick={addVariable}>+ 添加</button>
                </div>
                {Object.keys(variables).length > 0 && (
                  <div className="variables-list">
                    {Object.entries(variables).map(([k, v]) => (
                      <div key={k} className="var-item">
                        <span className="var-key">{k}</span>
                        <span className="var-value">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                        <button
                          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer' }}
                          onClick={() => removeVariable(k)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowStartModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleStart}>启动</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
