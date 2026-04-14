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
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force';
import KnowledgeNode from './KnowledgeNode';
import EntityNode from './EntityNode';
import FloatingEdge from './FloatingEdge';
import DetailPanel from './DetailPanel';

import '@xyflow/react/dist/style.css';

const defaultNodeTypes = {
  entity: KnowledgeNode,
  metric: KnowledgeNode,
  property: KnowledgeNode,
  shared_property: KnowledgeNode,
};

const entityNodeTypes = {
  entity: EntityNode,
  metric: EntityNode,
  property: KnowledgeNode,
  shared_property: KnowledgeNode,
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
    type: n.type || 'entity',
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

// Run force simulation on a subset of nodes/edges
function forceLayoutComponent(compNodes, compEdges, entityMode) {
  const n = compNodes.length;

  // Single node — no simulation needed
  if (n === 1) {
    return { [compNodes[0].id]: { x: 0, y: 0 } };
  }

  const large = n > 50;
  const chargeStrength = entityMode ? -3000 : (large ? -1200 : -500);
  const linkDistance = entityMode ? 450 : (large ? 250 : 200);
  const collideRadius = entityMode ? 200 : (large ? 80 : 90);

  const radius = Math.max(n * 5, 300);
  const simNodes = compNodes.map((nd, i) => ({
    id: nd.id,
    x: Math.cos(2 * Math.PI * i / n) * radius,
    y: Math.sin(2 * Math.PI * i / n) * radius,
  }));
  const simLinks = compEdges.map((e) => ({ source: e.source, target: e.target }));

  const charge = forceManyBody().strength(chargeStrength);
  if (large) charge.theta(1.2);

  // Gentle gravity pulls outliers inward without cramping the dense core
  const gravityStrength = large ? 0.08 : 0.05;

  const simulation = forceSimulation(simNodes)
    .force('link', forceLink(simLinks).id((d) => d.id).distance(linkDistance).strength(large ? 0.3 : 1))
    .force('charge', charge)
    .force('center', forceCenter(0, 0))
    .force('x', forceX(0).strength(gravityStrength))
    .force('y', forceY(0).strength(gravityStrength))
    .force('collide', forceCollide(collideRadius))
    .alphaDecay(large ? 0.04 : 0.0228)
    .stop();

  const iterations = large ? 250 : 300;
  for (let i = 0; i < iterations; i++) simulation.tick();

  const posById = {};
  simNodes.forEach((sn, i) => {
    posById[sn.id] = {
      x: isFinite(sn.x) ? sn.x : i * 100,
      y: isFinite(sn.y) ? sn.y : i * 100,
    };
  });
  return posById;
}

function layoutElements(nodes, edges, { entityMode = false } = {}) {
  // Detect connected components
  const adj = {};
  nodes.forEach((n) => { adj[n.id] = []; });
  edges.forEach((e) => { adj[e.source].push(e.target); adj[e.target].push(e.source); });

  const visited = new Set();
  const components = []; // each: array of node ids
  nodes.forEach((n) => {
    if (visited.has(n.id)) return;
    const comp = [];
    const stack = [n.id];
    while (stack.length) {
      const id = stack.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      comp.push(id);
      adj[id].forEach((nb) => { if (!visited.has(nb)) stack.push(nb); });
    }
    components.push(comp);
  });

  // Sort largest first
  components.sort((a, b) => b.length - a.length);

  const nodeById = {};
  nodes.forEach((n) => { nodeById[n.id] = n; });

  // Layout each component independently
  const compLayouts = components.map((compIds) => {
    const compIdSet = new Set(compIds);
    const compNodes = compIds.map((id) => nodeById[id]);
    const compEdges = edges.filter((e) => compIdSet.has(e.source) && compIdSet.has(e.target));
    const posById = forceLayoutComponent(compNodes, compEdges, entityMode);

    // Normalize positions so component's top-left is at (0, 0)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    compIds.forEach((id) => {
      minX = Math.min(minX, posById[id].x);
      minY = Math.min(minY, posById[id].y);
      maxX = Math.max(maxX, posById[id].x);
      maxY = Math.max(maxY, posById[id].y);
    });
    compIds.forEach((id) => {
      posById[id].x -= minX;
      posById[id].y -= minY;
    });

    return { ids: compIds, posById, width: maxX - minX, height: maxY - minY };
  });

  // Pack components: largest stays at origin, others stack to the right
  const gap = entityMode ? 300 : 150;
  const globalPos = {};

  if (compLayouts.length === 1) {
    // Single component — just use its positions directly
    const cl = compLayouts[0];
    cl.ids.forEach((id) => { globalPos[id] = cl.posById[id]; });
  } else {
    // Place the main (largest) component at origin
    const main = compLayouts[0];
    main.ids.forEach((id) => { globalPos[id] = main.posById[id]; });

    // Stack secondary components to the right, wrapping into columns
    let cursorX = main.width + gap * 2;
    let cursorY = 0;
    let colMaxWidth = 0;

    for (let i = 1; i < compLayouts.length; i++) {
      const cl = compLayouts[i];

      // Wrap to next column if this component would exceed the main cluster height
      if (cursorY > 0 && cursorY + cl.height > main.height) {
        cursorX += colMaxWidth + gap * 2;
        cursorY = 0;
        colMaxWidth = 0;
      }

      cl.ids.forEach((id) => {
        globalPos[id] = {
          x: cursorX + cl.posById[id].x,
          y: cursorY + cl.posById[id].y,
        };
      });

      colMaxWidth = Math.max(colMaxWidth, cl.width);
      cursorY += cl.height + gap;
    }
  }

  const layoutedNodes = nodes.map((node) => ({
    ...node,
    position: globalPos[node.id],
  }));

  return { nodes: layoutedNodes, edges };
}

function treeLayout(nodes, edges) {
  // For isA edges: source = child, target = parent.
  // Build a top-down tree with parents above children.
  const childrenOf = {}; // parentId -> [childId]
  const parentOf = {};   // childId -> parentId
  edges.forEach((e) => {
    if (!childrenOf[e.target]) childrenOf[e.target] = [];
    childrenOf[e.target].push(e.source);
    parentOf[e.source] = e.target;
  });

  // Find roots (nodes that are not children of anyone)
  const roots = nodes.filter((n) => !parentOf[n.id]).map((n) => n.id);
  // If no roots found (cycle), fall back to first node
  if (roots.length === 0 && nodes.length > 0) roots.push(nodes[0].id);

  // BFS to assign depth levels and horizontal positions
  const depth = {};
  const order = [];
  const visited = new Set();
  const queue = roots.map((id) => ({ id, level: 0 }));
  roots.forEach((id) => visited.add(id));

  while (queue.length > 0) {
    const { id, level } = queue.shift();
    depth[id] = level;
    order.push(id);
    const children = childrenOf[id] || [];
    children.forEach((childId) => {
      if (!visited.has(childId)) {
        visited.add(childId);
        queue.push({ id: childId, level: level + 1 });
      }
    });
  }

  // Include any unvisited nodes (disconnected)
  nodes.forEach((n) => {
    if (!visited.has(n.id)) {
      depth[n.id] = 0;
      order.push(n.id);
    }
  });

  // Group by level for horizontal spacing
  const levels = {};
  order.forEach((id) => {
    const lvl = depth[id];
    if (!levels[lvl]) levels[lvl] = [];
    levels[lvl].push(id);
  });

  const horizontalGap = 250;
  const verticalGap = 120;

  const posById = {};
  Object.entries(levels).forEach(([lvl, ids]) => {
    const totalWidth = (ids.length - 1) * horizontalGap;
    ids.forEach((id, i) => {
      posById[id] = {
        x: -totalWidth / 2 + i * horizontalGap,
        y: parseInt(lvl) * verticalGap,
      };
    });
  });

  return {
    nodes: nodes.map((node) => ({ ...node, position: posById[node.id] || { x: 0, y: 0 } })),
    edges,
  };
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
    if (isHierarchy) return treeLayout(rawNodes, rawEdges);
    return layoutElements(rawNodes, rawEdges, { entityMode: showProperties });
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
                Show Properties
              </button>
            )}
            <EnlargeButton customHeight={customHeight || '400px'} containerRef={containerRef} />
          </div>
        </Panel>
      </ReactFlow>
      <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  );
}
