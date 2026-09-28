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

  const navItems = [
    { to: '/dashboard', icon: '📊', label: '仪表盘' },
    { to: '/modeler', icon: '📝', label: '流程建模' },
    { to: '/tasks', icon: '✅', label: '任务处理' },
    { to: '/instances', icon: '📊', label: '流程实例' },
  ];

  return (
    <header className="app-header">
      <div className="app-title">BPMN 工作流平台</div>
      <nav className="app-nav">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}
            title={item.label}
          >
            {item.icon} <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="health-badge" title={health ? `${health.mode} · ${health.engine}` : '检测中...'}>
        <span className={`health-dot${health?.ok ? ' ok' : ''}`} />
        <span className="health-text">{health ? `${health.mode} · ${health.engine}` : '检测中...'}</span>
      </div>
    </header>
  );
}
