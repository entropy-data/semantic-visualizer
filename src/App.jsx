import React, { useMemo, useCallback, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  MarkerType,
  useReactFlow,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import KnowledgeNode from './KnowledgeNode';
import EntityNode from './EntityNode';
import FloatingEdge from './FloatingEdge';
import DetailPanel from './DetailPanel';

import '@xyflow/react/dist/style.css';

const defaultNodeTypes = {
  concept: KnowledgeNode,
  metric: KnowledgeNode,
  property: KnowledgeNode,
  sharedProperty: KnowledgeNode,
};

const entityNodeTypes = {
  concept: EntityNode,
  metric: EntityNode,
  property: KnowledgeNode,
  sharedProperty: KnowledgeNode,
};

const edgeTypes = {
  floating: FloatingEdge,
};

function toReactFlowElements(graphData) {
  const connectionCount = {};
  graphData.edges.forEach((e) => {
    connectionCount[e.source] = (connectionCount[e.source] || 0) + 1;
    connectionCount[e.target] = (connectionCount[e.target] || 0) + 1;
  });

  const nodes = graphData.nodes.map((n) => ({
    id: n.id,
    type: n.type || 'concept',
    position: { x: 0, y: 0 },
    data: { ...n.data, connections: connectionCount[n.id] || 0 },
  }));

  // Compute parallel edge offsets: edges between the same pair get an index
  const pairCounts = {};
  graphData.edges.forEach((e) => {
    const key = [e.source, e.target].sort().join('::');
    pairCounts[key] = (pairCounts[key] || 0) + 1;
  });
  const pairAssigned = {};
  const edgeParallelData = {};
  graphData.edges.forEach((e) => {
    const key = [e.source, e.target].sort().join('::');
    if (!pairAssigned[key]) pairAssigned[key] = 0;
    edgeParallelData[e.id] = { index: pairAssigned[key]++, total: pairCounts[key] };
  });

  const edges = graphData.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: 'floating',
    data: { label: e.label, parallel: edgeParallelData[e.id] },
    style: {
      stroke: '#94a3b8',
      strokeWidth: 1.5,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#94a3b8',
      width: 14,
      height: 14,
    },
    labelStyle: { fontSize: 10, fill: '#64748b', fontWeight: 500 },
    labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
    labelBgPadding: [4, 2],
  }));

  return { nodes, edges };
}

function layoutElements(nodes, edges, { entityMode = false } = {}) {
  // Spread nodes on a circle; larger radius for bigger graphs to avoid NaN
  const radius = Math.max(nodes.length * 5, 300);
  const simNodes = nodes.map((n, i) => ({
    id: n.id,
    x: Math.cos(2 * Math.PI * i / nodes.length) * radius,
    y: Math.sin(2 * Math.PI * i / nodes.length) * radius,
  }));
  const simLinks = edges.map((e) => ({ source: e.source, target: e.target }));

  const n = simNodes.length;
  const large = n > 50;
  // Entity cards are ~220px wide and can be 300+px tall — need much more space
  const chargeStrength = entityMode ? -3000 : (large ? -1200 : -500);
  const linkDistance = entityMode ? 450 : (large ? 250 : 200);
  const collideRadius = entityMode ? 200 : (large ? 80 : 90);

  const charge = forceManyBody().strength(chargeStrength);
  if (large) charge.theta(1.2);

  const simulation = forceSimulation(simNodes)
    .force('link', forceLink(simLinks).id((d) => d.id).distance(linkDistance).strength(large ? 0.3 : 1))
    .force('charge', charge)
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide(collideRadius))
    .alphaDecay(large ? 0.04 : 0.0228)
    .stop();

  const iterations = large ? 250 : 300;
  for (let i = 0; i < iterations; i++) simulation.tick();

  // Guard against NaN positions
  const posById = {};
  simNodes.forEach((sn, i) => {
    const x = isFinite(sn.x) ? sn.x : i * 100;
    const y = isFinite(sn.y) ? sn.y : i * 100;
    posById[sn.id] = { x, y };
  });

  const layoutedNodes = nodes.map((node) => ({
    ...node,
    position: posById[node.id],
  }));

  return { nodes: layoutedNodes, edges };
}

// Build adjacency: for each node, the set of connected node IDs and edge IDs
function buildAdjacency(edges) {
  const neighborNodes = {};
  const neighborEdges = {};
  edges.forEach((e) => {
    if (!neighborNodes[e.source]) neighborNodes[e.source] = new Set();
    if (!neighborNodes[e.target]) neighborNodes[e.target] = new Set();
    neighborNodes[e.source].add(e.target);
    neighborNodes[e.target].add(e.source);

    if (!neighborEdges[e.source]) neighborEdges[e.source] = new Set();
    if (!neighborEdges[e.target]) neighborEdges[e.target] = new Set();
    neighborEdges[e.source].add(e.id);
    neighborEdges[e.target].add(e.id);
  });
  return { neighborNodes, neighborEdges };
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
function EnlargeButton({ customHeight, containerRef }) {
  const { fitView } = useReactFlow();
  const [enlarged, setEnlarged] = useState(false);

  const toggle = useCallback(() => {
    const container = containerRef.current?.closest('.semantic-visualizer');
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
  }, [enlarged, customHeight, fitView, containerRef]);

  return (
    <button onClick={toggle} style={toggleBtnStyle(false)}
      onMouseOver={(e) => e.currentTarget.style.background = '#f9fafb'}
      onMouseOut={(e) => e.currentTarget.style.background = '#fff'}>
      {enlarged ? 'shrink' : 'enlarge'}
    </button>
  );
}

export default function App({ graphData, customHeight, layout }) {
  const { fitView } = useReactFlow();
  const containerRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [showProperties, setShowProperties] = useState(false);
  const isHierarchy = layout === 'tree';
  const nodeTypes = showProperties && !isHierarchy ? entityNodeTypes : defaultNodeTypes;

  const layouted = useMemo(() => {
    const { nodes: rawNodes, edges: rawEdges } = toReactFlowElements(graphData);
    return layoutElements(rawNodes, rawEdges, { entityMode: showProperties && !isHierarchy });
  }, [graphData, showProperties, isHierarchy]);

  const adjacency = useMemo(
    () => buildAdjacency(layouted.edges),
    [layouted.edges],
  );

  // Apply highlight/dim based on selected node
  const displayNodes = useMemo(() => {
    if (!selectedNode) return layouted.nodes;
    const activeNodes = new Set([selectedNode.id]);
    (adjacency.neighborNodes[selectedNode.id] || new Set()).forEach((id) => activeNodes.add(id));

    return layouted.nodes.map((node) => ({
      ...node,
      data: { ...node.data, dimmed: !activeNodes.has(node.id) },
    }));
  }, [layouted.nodes, selectedNode, adjacency]);

  const displayEdges = useMemo(() => {
    if (!selectedNode) return layouted.edges;
    const activeEdges = adjacency.neighborEdges[selectedNode.id] || new Set();

    return layouted.edges.map((edge) => {
      const active = activeEdges.has(edge.id);
      return {
        ...edge,
        style: {
          stroke: active ? '#6366f1' : '#e2e8f0',
          strokeWidth: active ? 2.5 : 1,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: active ? '#6366f1' : '#e2e8f0',
          width: 14,
          height: 14,
        },
        data: { ...edge.data, dimmed: !active },
        labelStyle: active
          ? { fontSize: 11, fill: '#4338ca', fontWeight: 600 }
          : { fontSize: 10, fill: '#e2e8f0', fontWeight: 500 },
        labelBgStyle: active
          ? { fill: '#eef2ff', fillOpacity: 1 }
          : { fill: '#fff', fillOpacity: 0.5 },
        zIndex: active ? 10 : 0,
      };
    });
  }, [layouted.edges, selectedNode, adjacency]);

  const [nodes, setNodes, onNodesChange] = useNodesState(displayNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(displayEdges);

  const [prevLayouted, setPrevLayouted] = useState(layouted);
  const [prevDisplayEdges, setPrevDisplayEdges] = useState(displayEdges);

  // When layout changes (e.g. toggle properties), apply new positions
  if (layouted !== prevLayouted) {
    setPrevLayouted(layouted);
    setNodes(displayNodes);
    setEdges(displayEdges);
    setPrevDisplayEdges(displayEdges);
  }
  // When only highlight/dim changes (e.g. node click), preserve current positions
  else if (displayEdges !== prevDisplayEdges) {
    setPrevDisplayEdges(displayEdges);
    setNodes((cur) => cur.map((node) => {
      const display = displayNodes.find((d) => d.id === node.id);
      return display ? { ...node, data: display.data } : node;
    }));
    setEdges(displayEdges);
  }

  const resetLayout = useCallback(() => {
    setSelectedNode(null);
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
    setTimeout(() => fitView({ padding: 0.3, maxZoom: 1 }), 0);
  }, [layouted, setNodes, setEdges, fitView]);

  const onNodeClick = useCallback((_event, node) => {
    setSelectedNode((prev) => prev?.id === node.id ? null : node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
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
            {!isHierarchy && (
              <button
                onClick={() => {
                  setShowProperties((v) => !v);
                  setTimeout(() => fitView({ padding: 0.3, maxZoom: 1 }), 0);
                }}
                style={toggleBtnStyle(showProperties)}
                onMouseOver={(e) => { if (!showProperties) e.currentTarget.style.background = '#f9fafb'; }}
                onMouseOut={(e) => { if (!showProperties) e.currentTarget.style.background = '#fff'; }}
                title="Show properties on concept and metric nodes"
              >
                Properties
              </button>
            )}
            <button
              onClick={resetLayout}
              style={toggleBtnStyle(false)}
              onMouseOver={(e) => e.currentTarget.style.background = '#f9fafb'}
              onMouseOut={(e) => e.currentTarget.style.background = '#fff'}
              title="Reset node positions to automatic layout"
            >
              Reset Layout
            </button>
            <EnlargeButton customHeight={customHeight || '400px'} containerRef={containerRef} />
          </div>
        </Panel>
      </ReactFlow>
      <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  );
}
