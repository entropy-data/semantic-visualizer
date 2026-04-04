import React, { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  ConnectionLineType,
  Background,
  Controls,
  MarkerType,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import EntityNode from './EntityNode';
import MetricNode from './MetricNode';

import '@xyflow/react/dist/style.css';

const nodeTypes = {
  entity: EntityNode,
  metric: MetricNode,
  property: EntityNode, // shared properties look similar
};

// Estimate node dimensions for Dagre layout
const NODE_WIDTH = 220;
const HEADER_HEIGHT = 36;
const PROPERTY_ROW_HEIGHT = 22;
const PADDING = 8;

function getNodeHeight(node) {
  const props = node.data?.properties || [];
  if (props.length === 0) return HEADER_HEIGHT + PADDING;
  return HEADER_HEIGHT + props.length * PROPERTY_ROW_HEIGHT + PADDING;
}

function toReactFlowElements(graphData) {
  const nodes = graphData.nodes.map((n) => ({
    id: n.id,
    type: n.type || 'entity',
    position: { x: 0, y: 0 },
    data: n.data,
  }));

  const edges = graphData.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    labelStyle: { fontSize: 11, fill: '#64748b' },
    labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.85 },
    labelBgPadding: [4, 2],
  }));

  return { nodes, edges };
}

function layoutElements(nodes, edges) {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: getNodeHeight(node) });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    const h = getNodeHeight(node);
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - h / 2 },
      style: { width: NODE_WIDTH },
    };
  });

  return { nodes: layoutedNodes, edges };
}

export default function App({ graphData }) {
  const { nodes, edges } = useMemo(() => {
    const { nodes: rawNodes, edges: rawEdges } = toReactFlowElements(graphData);
    return layoutElements(rawNodes, rawEdges);
  }, [graphData]);

  const onNodeClick = useCallback((_event, node) => {
    if (node.data?.link) {
      window.location.href = node.data.link;
    }
  }, []);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={false}
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
      >
        <Background color="#e2e8f0" gap={20} />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
