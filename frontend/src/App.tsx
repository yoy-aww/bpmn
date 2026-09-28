import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import Header from './components/Header';
import DashboardPage from './pages/DashboardPage';
import ModelerPage from './pages/ModelerPage';
import TaskPage from './pages/TaskPage';
import InstancesPage from './pages/InstancesPage';

export default function App() {
  return (
    <ToastProvider>
      <div className="app-layout">
        <Header />
        <div className="app-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/modeler" element={<ModelerPage />} />
            <Route path="/tasks" element={<TaskPage />} />
            <Route path="/instances" element={<InstancesPage />} />
          </Routes>
        </div>
      </div>
    </ToastProvider>
  );
}
