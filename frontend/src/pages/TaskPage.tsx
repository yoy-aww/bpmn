import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import type { UserTask, TaskComment } from '../types/bpmn';

export default function TaskPage() {
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<UserTask | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');

  const refreshTasks = async () => {
    try {
      const list = await api.task.list({ assignee: filterAssignee || undefined });
      setTasks(list);
    } catch (err: any) {
      showToast(`加载任务失败: ${err.message}`, 'error');
    }
  };

  useEffect(() => {
    refreshTasks();
  }, [filterAssignee]);

  const handleSelectTask = async (task: UserTask) => {
    setSelectedTask(task);
    try {
      const c = await api.task.comments(task.id);
      setComments(c);
    } catch {
      setComments([]);
    }
  };

  const handleComplete = async () => {
    if (!selectedTask) return;
    try {
      await api.task.complete(selectedTask.id);
      showToast(`任务完成: ${selectedTask.name}`, 'success');
      setSelectedTask(null);
      setComments([]);
      refreshTasks();
    } catch (err: any) {
      showToast(`完成失败: ${err.message}`, 'error');
    }
  };

  const handleAssign = async () => {
    if (!selectedTask || !newAssignee.trim()) return;
    try {
      await api.task.assign(selectedTask.id, newAssignee);
      showToast(`已指派给 ${newAssignee}`, 'success');
      setNewAssignee('');
      refreshTasks();
      setSelectedTask({ ...selectedTask, assignee: newAssignee });
    } catch (err: any) {
      showToast(`指派失败: ${err.message}`, 'error');
    }
  };

  const handleAddComment = async () => {
    if (!selectedTask || !commentText.trim()) return;
    try {
      const c = await api.task.comment(selectedTask.id, 'demo-user', commentText);
      setComments(prev => [...prev, c]);
      setCommentText('');
    } catch (err: any) {
      showToast(`评论失败: ${err.message}`, 'error');
    }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <input
          className="input"
          style={{ width: 200 }}
          placeholder="按负责人筛选..."
          value={filterAssignee}
          onChange={e => setFilterAssignee(e.target.value)}
        />
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={refreshTasks}>🔄 刷新</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', flex: 1, overflow: 'hidden' }}>
        <div style={{ borderRight: '1px solid var(--border)', overflow: 'auto' }}>
          <div className="task-list">
            {tasks.length === 0 ? (
              <div className="empty-state">
                <h3>暂无任务</h3>
                <p>启动一个流程实例后会生成任务</p>
              </div>
            ) : (
              tasks.map(task => (
                <div
                  key={task.id}
                  className={`task-card${selectedTask?.id === task.id ? ' selected' : ''}`}
                  onClick={() => handleSelectTask(task)}
                >
                  <div className="task-card-title">{task.name}</div>
                  <div className="task-card-meta">
                    <span>👤 {task.assignee || '未指派'}</span>
                    <span>🔑 {task.taskDefinitionKey}</span>
                    <span>⏰ {new Date(task.createTime).toLocaleString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ overflow: 'auto' }}>
          {selectedTask ? (
            <div className="task-detail">
              <div className="task-detail-section">
                <div className="section-title">任务信息</div>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>任务 ID</span>
                  <span>{selectedTask.id}</span>
                  <span style={{ color: 'var(--text-muted)' }}>任务名称</span>
                  <span>{selectedTask.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>实例 ID</span>
                  <span>{selectedTask.processInstanceId}</span>
                  <span style={{ color: 'var(--text-muted)' }}>任务定义 Key</span>
                  <span>{selectedTask.taskDefinitionKey}</span>
                  <span style={{ color: 'var(--text-muted)' }}>创建时间</span>
                  <span>{new Date(selectedTask.createTime).toLocaleString()}</span>
                  <span style={{ color: 'var(--text-muted)' }}>负责人</span>
                  <span>{selectedTask.assignee || '-'}</span>
                </div>
              </div>

              <div className="task-detail-section">
                <div className="section-title">变量</div>
                <div className="variables-list">
                  {Object.entries(selectedTask.variables).length === 0 ? (
                    <div style={{ color: 'var(--text-muted)' }}>无变量</div>
                  ) : (
                    Object.entries(selectedTask.variables).map(([k, v]) => (
                      <div key={k} className="var-item">
                        <span className="var-key">{k}</span>
                        <span className="var-value">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="task-detail-section">
                <div className="section-title">指派任务</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    placeholder="用户名"
                    value={newAssignee}
                    onChange={e => setNewAssignee(e.target.value)}
                  />
                  <button className="btn" onClick={handleAssign}>指派</button>
                </div>
              </div>

              <div className="task-detail-section">
                <div className="section-title">评论</div>
                <div className="comments-list" style={{ marginBottom: 12 }}>
                  {comments.map(c => (
                    <div key={c.id} className="comment-item">
                      <div className="comment-meta">
                        {c.userId} · {new Date(c.created).toLocaleString()}
                      </div>
                      <div>{c.message}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    placeholder="输入评论..."
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                  />
                  <button className="btn" onClick={handleAddComment}>发送</button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn btn-success" onClick={handleComplete}>
                  ✅ 完成任务
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <h3>选择左侧任务查看详情</h3>
              <p>可以查看任务变量、添加评论、完成任务</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
