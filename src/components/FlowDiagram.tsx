import { PackFlow, TEMPLATE_META, TemplateType } from '../../shared/schema';

interface FlowDiagramProps {
  template: TemplateType;
  flow?: PackFlow;
  activeSegmentId: string;
  activeLabel: string;
  hiddenInFreeMode?: boolean;
  onSelectSegment?: (segId: string) => void;
}

export function FlowDiagram({
  template,
  flow,
  activeSegmentId,
  activeLabel,
  hiddenInFreeMode = false,
  onSelectSegment
}: FlowDiagramProps) {
  const allowsFlow = TEMPLATE_META[template]?.allowsFlow;
  if (!allowsFlow || !flow || !Array.isArray(flow.nodes) || flow.nodes.length === 0) {
    return null;
  }

  if (hiddenInFreeMode) {
    return (
      <div className="flow-card flow-hidden-banner" data-testid="flow-hidden-banner">
        <span>🔒 Sơ đồ Flow đang ẩn ở chế độ Free để rèn phản xạ tự nhiên.</span>
      </div>
    );
  }

  const edgeSet = new Set((flow.edges || []).map(([u, v]) => `${u}->${v}`));
  const isDeepDiveOpen = activeLabel === 'deep_dive' || activeLabel === 'tradeoff';

  return (
    <aside className={`flow-card flow-kind-${flow.kind}`} aria-label="Sơ đồ minh hoạ câu trả lời" data-testid="flow-diagram">
      <div className="flow-header">
        <span className="flow-badge">
          {flow.kind === 'architecture'
            ? '🏗️ Architecture Flow'
            : flow.kind === 'decision-tree'
            ? '🌿 Decision Tree'
            : '⚡ Linear Pipeline'}
        </span>
        {template === 'system_design' && (
          <span className="flow-tier-pill">
            {isDeepDiveOpen ? 'Deep Dive Unlocked' : 'High-Level View'}
          </span>
        )}
      </div>

      <div className="flow-nodes-scroll">
        <div className="flow-nodes-track">
          {flow.nodes.map((node, idx) => {
            const isActive = node.seg === activeSegmentId;
            const nextNode = flow.nodes[idx + 1];
            const hasArrowToNext = nextNode && edgeSet.has(`${node.id}->${nextNode.id}`);

            return (
              <div key={node.id} className="flow-node-wrapper">
                <button
                  type="button"
                  className={`flow-node ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectSegment?.(node.seg)}
                  title={`Nhảy tới segment: ${node.seg}`}
                >
                  <span className="flow-node-id">{node.id.toUpperCase()}</span>
                  <span className="flow-node-label">{node.label}</span>
                  <span className="flow-node-seg">#{node.seg}</span>
                </button>
                {idx < flow.nodes.length - 1 && (
                  <span className={`flow-connector ${hasArrowToNext ? 'connected' : 'branch'}`}>
                    →
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
