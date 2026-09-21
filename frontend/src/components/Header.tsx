import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../services/api';

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
        <NavLink to="/modeler" className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}>
          📝 流程建模
        </NavLink>
        <NavLink to="/tasks" className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}>
          ✅ 任务处理
        </NavLink>
        <NavLink to="/instances" className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}>
          📊 流程实例
        </NavLink>
      </nav>
      <div className="health-badge">
        <span className={`health-dot${health?.ok ? ' ok' : ''}`} />
        <span>{health ? `${health.mode} · ${health.engine}` : '检测中...'}</span>
      </div>
    </header>
  );
}
