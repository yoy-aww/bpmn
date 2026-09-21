import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';

export interface BpmnEditorHandle {
  saveXML: () => Promise<string>;
  loadXML: (xml: string) => Promise<void>;
  clear: () => void;
  getDefinitions: () => any;
}

interface BpmnEditorProps {
  initialXml?: string;
  onChange?: (xml: string) => void;
}

const DEFAULT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" name="示例流程" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="开始">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_Approval" name="审批任务">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="EndEvent_1" name="结束">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_Approval"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_Approval" targetRef="EndEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="102" width="36" height="36"/>
        <bpmndi:BPMNLabel>
          <dc:Bounds x="157" y="145" width="26" height="14"/>
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Approval_di" bpmnElement="Task_Approval">
        <dc:Bounds x="220" y="80" width="100" height="80"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="372" y="102" width="36" height="36"/>
        <bpmndi:BPMNLabel>
          <dc:Bounds x="377" y="145" width="26" height="14"/>
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <dc:waypoint x="188" y="120"/>
        <dc:waypoint x="220" y="120"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <dc:waypoint x="320" y="120"/>
        <dc:waypoint x="372" y="120"/>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const BpmnEditor = forwardRef<BpmnEditorHandle, BpmnEditorProps>(
  function BpmnEditor({ initialXml, onChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const modelerRef = useRef<BpmnModeler | null>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      if (!containerRef.current) return;

      const modeler = new BpmnModeler({
        container: containerRef.current,
      });

      modelerRef.current = modeler;

      const xml = initialXml || DEFAULT_XML;
      modeler.importXML(xml).then(() => {
        setReady(true);
      }).catch((err: any) => {
        console.error('Import error:', err);
        setError(err.message || String(err));
        modeler.importXML(DEFAULT_XML).then(() => setReady(true));
      });

      const emitChange = () => {
        if (!onChange || !modelerRef.current) return;
        modelerRef.current.saveXML().then(({ xml: newXml }) => {
          if (newXml) onChange(newXml);
        });
      };

      modeler.on('element.changed', emitChange);
      modeler.on('element.created', emitChange);

      const resizeObserver = new ResizeObserver(() => {
        const canvas = modeler.get<any>('canvas');
        if (canvas?.resized) canvas.resized();
      });
      resizeObserver.observe(containerRef.current);

      return () => {
        resizeObserver.disconnect();
        modeler.destroy();
        modelerRef.current = null;
      };
    }, []);

    useImperativeHandle(ref, () => ({
      async saveXML(): Promise<string> {
        if (!modelerRef.current) return '';
        const { xml } = await modelerRef.current.saveXML({ format: true });
        return xml || '';
      },
      async loadXML(xml: string): Promise<void> {
        if (!modelerRef.current) return;
        try {
          await modelerRef.current.importXML(xml);
          const canvas = modelerRef.current.get<any>('canvas');
          if (canvas?.resized) canvas.resized();
        } catch (err) {
          console.error('Load XML error:', err);
          throw err;
        }
      },
      clear(): void {
        if (!modelerRef.current) return;
        modelerRef.current.clear();
        const canvas = modelerRef.current.get<any>('canvas');
        if (canvas?.resized) canvas.resized();
      },
      getDefinitions(): any {
        return modelerRef.current?.getDefinitions();
      },
    }));

    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <div id="bpmn-canvas" ref={containerRef} style={{ width: '100%', height: '100%' }} />
        {!ready && (
          <div className="loading">{error ? `加载失败: ${error}` : '加载建模器中...'}</div>
        )}
      </div>
    );
  },
);

export default BpmnEditor;
