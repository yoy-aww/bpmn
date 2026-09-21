import { useRef, useState } from 'react';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import BpmnEditor, { type BpmnEditorHandle } from '../components/BpmnEditor';
import type { ProcessDefinition } from '../types/bpmn';

export default function ModelerPage() {
  const editorRef = useRef<BpmnEditorHandle>(null);
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [showXml, setShowXml] = useState(false);
  const [currentXml, setCurrentXml] = useState('');
  const [definitions, setDefinitions] = useState<ProcessDefinition[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [selectedDefId, setSelectedDefId] = useState<string | null>(null);

  const handleDeploy = async () => {
    if (!name.trim()) {
      showToast('请输入流程名称', 'warning');
      return;
    }
    if (!editorRef.current) return;

    try {
      setDeploying(true);
      const xml = await editorRef.current.saveXML();
      const def = await api.process.deploy(xml, name);
      showToast(`部署成功: ${def.id}`, 'success');
      // 刷新列表
      refreshDefinitions();
    } catch (err: any) {
      showToast(`部署失败: ${err.message}`, 'error');
    } finally {
      setDeploying(false);
    }
  };

  const handleExport = async () => {
    const xml = await editorRef.current?.saveXML() || '';
    setCurrentXml(xml);
    setShowXml(true);
  };

  const handleClear = () => {
    editorRef.current?.clear();
    showToast('已清空画布', 'info');
  };

  const refreshDefinitions = async () => {
    try {
      const list = await api.process.list();
      setDefinitions(list);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLoadDefinition = async (def: ProcessDefinition) => {
    if (!def.xml) {
      showToast('该定义没有 XML 内容', 'warning');
      return;
    }
    try {
      await editorRef.current?.loadXML(def.xml);
      setName(def.name);
      setSelectedDefId(def.id);
      showToast(`已加载: ${def.name}`, 'success');
    } catch (err: any) {
      showToast(`加载失败: ${err.message}`, 'error');
    }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <input
          className="input"
          style={{ width: 200 }}
          placeholder="流程名称"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <button className="btn btn-primary" onClick={handleDeploy} disabled={deploying}>
          {deploying ? '部署中...' : '🚀 部署流程'}
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={handleExport}>📋 查看 XML</button>
        <button className="btn" onClick={handleClear}>🗑️ 清空</button>
      </div>

      <div className="editor-layout">
        <div className="editor-canvas">
          <BpmnEditor ref={editorRef} onChange={setCurrentXml} />
        </div>

        <div className="editor-sidebar">
          <div className="sidebar-section">
            <div className="sidebar-title">已部署流程</div>
            {definitions.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8 }}>
                暂无已部署的流程。点击"部署流程"开始。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {definitions.map(def => (
                  <div
                    key={def.id}
                    style={{
                      padding: '8px 10px',
                      background: def.id === selectedDefId ? 'var(--bg-elevated)' : 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                    onClick={() => handleLoadDefinition(def)}
                  >
                    <div style={{ fontWeight: 600 }}>{def.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                      key: {def.key} · v{def.version}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              className="btn"
              style={{ marginTop: 8, width: '100%' }}
              onClick={refreshDefinitions}
            >
              🔄 刷新
            </button>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-title">提示</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <div>• 左侧调色板拖拽元素到画布</div>
              <div>• 元素间用连线连接</div>
              <div>• 双击元素编辑名称</div>
              <div>• 右键元素追加子元素</div>
              <div>• Ctrl+Z 撤销</div>
              <div>• 完成后点击"部署流程"</div>
            </div>
          </div>
        </div>
      </div>

      {showXml && (
        <div className="modal-overlay" onClick={() => setShowXml(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 800 }}>
            <div className="modal-title">BPMN XML</div>
            <pre className="xml-viewer">{currentXml}</pre>
            <div className="modal-actions">
              <button className="btn" onClick={() => navigator.clipboard.writeText(currentXml)}>
                复制
              </button>
              <button className="btn" onClick={() => setShowXml(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
