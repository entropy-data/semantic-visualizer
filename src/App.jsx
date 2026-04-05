import React, { useMemo, useCallback, useState } from 'react';
import {
  ReactFlow,
  ConnectionLineType,
  Background,
  Controls,
  Panel,
  useReactFlow,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import EntityNode from './EntityNode';
import DetailPanel from './DetailPanel';

import '@xyflow/react/dist/style.css';

const nodeTypes = {
  concept: EntityNode,
  metric: EntityNode,
  property: EntityNode,
};

const MAX_VISIBLE_PROPERTIES = 8;

// Node dimensions for layout
const NODE_WIDTH = 250;
const HEADER_HEIGHT = 40;
const FIELD_ROW_HEIGHT = 30;
const MORE_ROW_HEIGHT = 24;
const DESC_HEIGHT = 50;

function getNodeHeight(node, hideProperties) {
  const props = hideProperties ? [] : (node.data?.properties || []);
  const description = node.data?.description;
  const accent = 6;

  if (props.length === 0) {
    return accent + HEADER_HEIGHT + (description ? DESC_HEIGHT : 0);
  }

  const visibleCount = Math.min(props.length, MAX_VISIBLE_PROPERTIES);
  const hasMore = props.length > MAX_VISIBLE_PROPERTIES;
  return accent + HEADER_HEIGHT + visibleCount * FIELD_ROW_HEIGHT + (hasMore ? MORE_ROW_HEIGHT : 0);
}

function toReactFlowElements(graphData, hideInheritance) {
  const nodes = graphData.nodes.map((n) => ({
    id: n.id,
    type: n.type || 'concept',
    position: { x: 0, y: 0 },
    data: n.data,
  }));

  const filteredEdges = hideInheritance
    ? graphData.edges.filter((e) => e.type !== 'isA')
    : graphData.edges;

  const edges = filteredEdges.map((e) => {
    const isInheritance = e.type === 'isA';

    // For isA, swap source/target so superclass (target) is placed on top by dagre TB layout
    const source = isInheritance ? e.target : e.source;
    const target = isInheritance ? e.source : e.target;

    return {
      id: e.id,
      source,
      target,
      sourceHandle: 'bottom',
      targetHandle: 'top',
      label: e.label,
      type: 'default', // bezier
      markerEnd: isInheritance ? 'marker-inheritance' : 'marker-association',
      style: {
        stroke: isInheritance ? '#94a3b8' : '#b1b1b7',
        strokeWidth: 1.5,
      },
      labelStyle: { fontSize: 10, fill: '#94a3b8', fontWeight: 500 },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.85 },
      labelBgPadding: [4, 2],
    };
  });

  return { nodes, edges };
}

function layoutElements(nodes, edges, hideProperties) {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 100 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: getNodeHeight(node, hideProperties) });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    const h = getNodeHeight(node, hideProperties);
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - h / 2 },
      style: { width: NODE_WIDTH },
      data: { ...node.data, hideProperties },
    };
  });

  return { nodes: layoutedNodes, edges };
}

// Custom SVG marker definitions
function MarkerDefs() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        <marker id="marker-inheritance" viewBox="0 0 10 10" refX="10" refY="5"
          markerWidth="10" markerHeight="10" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#fff" stroke="#94a3b8" strokeWidth="1" />
        </marker>
        <marker id="marker-association" viewBox="0 0 8 8" refX="8" refY="4"
          markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#b1b1b7" />
        </marker>
      </defs>
    </svg>
  );
}

// Toggle button style helper
const toggleBtnStyle = (active) => ({
  borderRadius: 4,
  background: active ? '#eef2ff' : '#fff',
  padding: '4px 8px',
  fontSize: 12,
  fontWeight: 500,
  color: active ? '#4f46e5' : '#374151',
  boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
  border: `1px solid ${active ? '#a5b4fc' : '#d1d5db'}`,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
});

// Enlarge/shrink button
function EnlargeButton({ customHeight }) {
  const { fitView } = useReactFlow();
  const [enlarged, setEnlarged] = useState(false);

  const toggle = useCallback(() => {
    const container = document.getElementById('semantic-visualizer');
    if (!container) return;
    if (enlarged) {
      container.style.height = customHeight;
      setEnlarged(false);
    } else {
      container.style.height = '100vh';
      setEnlarged(true);
    }
    setTimeout(() => {
      fitView();
      container.scrollIntoView(true);
    }, 0);
  }, [enlarged, customHeight, fitView]);

  return (
    <button onClick={toggle} style={toggleBtnStyle(false)}
      onMouseOver={(e) => e.currentTarget.style.background = '#f9fafb'}
      onMouseOut={(e) => e.currentTarget.style.background = '#fff'}>
      {enlarged ? 'shrink' : 'enlarge'}
    </button>
  );
}

export default function App({ graphData, customHeight }) {
  const { fitView } = useReactFlow();
  const [hideProperties, setHideProperties] = useState(false);
  const [hideInheritance, setHideInheritance] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);

  const layouted = useMemo(() => {
    const { nodes: rawNodes, edges: rawEdges } = toReactFlowElements(graphData, hideInheritance);
    return layoutElements(rawNodes, rawEdges, hideProperties);
  }, [graphData, hideProperties, hideInheritance]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layouted.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layouted.edges);

  // Sync when layout inputs change
  const [prevLayouted, setPrevLayouted] = useState(layouted);
  if (layouted !== prevLayouted) {
    setPrevLayouted(layouted);
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }

  const resetLayout = useCallback(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
    setTimeout(() => fitView({ padding: 0.3, maxZoom: 1 }), 0);
  }, [layouted, setNodes, setEdges, fitView]);

  const onNodeClick = useCallback((_event, node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MarkerDefs />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.Bezier}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        zoomOnDoubleClick={true}
        preventScrolling={false}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
      >
        <Background color="#e2e8f0" gap={20} />
        <Controls position="bottom-left" showInteractive={false} />
        <Panel position="top-right">
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={resetLayout}
              style={toggleBtnStyle(false)}
              onMouseOver={(e) => e.currentTarget.style.background = '#f9fafb'}
              onMouseOut={(e) => e.currentTarget.style.background = '#fff'}
              title="Reset node positions to automatic layout"
            >
              Reset Layout
            </button>
            <button
              onClick={() => setHideProperties((v) => !v)}
              style={toggleBtnStyle(hideProperties)}
            >
              {hideProperties ? 'Show Properties' : 'Hide Properties'}
            </button>
            <button
              onClick={() => setHideInheritance((v) => !v)}
              style={toggleBtnStyle(hideInheritance)}
            >
              {hideInheritance ? 'Show Inheritance' : 'Hide Inheritance'}
            </button>
            <EnlargeButton customHeight={customHeight || '400px'} />
          </div>
        </Panel>
      </ReactFlow>
      <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  );
}
