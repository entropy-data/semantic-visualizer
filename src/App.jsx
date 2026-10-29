import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ReactFlow,
  Background,
  Controls,
  ControlButton,
  MiniMap,
  Panel,
  MarkerType,
  useReactFlow,
  useStore,
  useStoreApi,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import KnowledgeNode from './KnowledgeNode';
import EntityNode from './EntityNode';
import GroupNode from './GroupNode';
import FloatingEdge from './FloatingEdge';
import DetailPanel from './DetailPanel';
import NamespaceFilter from './NamespaceFilter';
import { GroupActionsContext } from './GroupActionsContext';
import { EdgeLabelContext } from './EdgeLabelContext';
import { placeEdgeLabels, makeLabelMeasurer } from './labelPlacement';
import { layoutElements, layoutWithGroups, treeLayout } from './layout';
import {
  zoomInIcon, zoomOutIcon, fitViewIcon, autoLayoutIcon, expandAllIcon, collapseAllIcon,
  enterFullScreenIcon, exitFullScreenIcon, changesOnlyIcon, groupsIcon, erdIcon,
} from './controlIcons';
import { loadLayout, savePositions, clearPositions, saveToggles } from './storage';
import { DIFF_STYLES } from './diffStyles';
import { multiplicityEnds } from './multiplicity';

import '@xyflow/react/dist/style.css';

const defaultNodeTypes = {
  entity: KnowledgeNode,
  metric: KnowledgeNode,
  property: KnowledgeNode,
  shared_property: KnowledgeNode,
  group: GroupNode,
  // Collapsed groups use a non-'group' type so React Flow treats them as regular
  // nodes — v12 filters edges whose source/target is a 'group'-type (container)
  // node from the default edge renderer.
  collapsed_group: GroupNode,
};

const entityNodeTypes = {
  entity: EntityNode,
  metric: EntityNode,
  property: KnowledgeNode,
  shared_property: KnowledgeNode,
  group: GroupNode,
  collapsed_group: GroupNode,
};

const edgeTypes = {
  floating: FloatingEdge,
};

// The canvas is stacked by hand (zIndexMode="manual"), bottom to top: group hulls, edges (0, a diff
// at 5, a focused one at 10), the edge-label layer (11, see index.css), then the concept pills, so a
// label that runs into a concept tucks under it instead of covering its name. React Flow's default
// mode adds a grouped node's z to every edge touching it, which would lift those edges and their
// dashes back over the labels.
const GROUP_Z = -10;
const NODE_Z = 20;

function toReactFlowElements(graphData, { entityMode = false } = {}) {
  const connectionCount = {};
  graphData.edges.forEach((e) => {
    connectionCount[e.source] = (connectionCount[e.source] || 0) + 1;
    connectionCount[e.target] = (connectionCount[e.target] || 0) + 1;
  });

  const nodes = graphData.nodes.map((n) => ({
    id: n.id,
    type: n.type || 'entity',
    parentId: n.parentId || undefined,
    position: { x: 0, y: 0 },
    zIndex: n.type === 'group' ? GROUP_Z : NODE_Z,
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

  const edges = graphData.edges.map((e) => {
    // A relationship the branch touches is a change in its own right, and is listed as one
    // in the proposed-changes list — so it has to be legible in the graph too, not just implied by
    // the concepts it happens to connect.
    const diff = DIFF_STYLES[e.diff];
    const stroke = diff ? diff.color : '#94a3b8';
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'floating',
      data: {
        label: e.label, parallel: edgeParallelData[e.id], externalId: e.externalId,
        diff: e.diff, diffDetail: e.diffDetail, evidence: e.evidence, evidenceMissing: e.evidenceMissing,
        relationshipType: e.type, description: e.description, multiplicity: e.multiplicity, link: e.link,
        // Multiplicity is ER notation, so its marks are drawn at the edge's ends only in the
        // entity-relationship view; the detail panel names it in every view.
        endLabels: entityMode ? multiplicityEnds(e.multiplicity) : null,
      },
      style: {
        stroke,
        strokeWidth: diff ? 2.5 : 1.5,
        // A removed relationship still has both ends in the graph, so it can only be told apart
        // from a surviving one by how it is drawn.
        ...(e.diff === 'remove' ? { strokeDasharray: '6 4' } : {}),
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: stroke,
        width: 14,
        height: 14,
      },
      labelStyle: diff
        ? { fontSize: 11, fill: stroke, fontWeight: 700 }
        : { fontSize: 10, fill: '#64748b', fontWeight: 500 },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
      labelBgPadding: [4, 2],
      zIndex: diff ? 5 : 0,
    };
  });

  return { nodes, edges };
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

// Collapse pre-transform: applied BEFORE layout. Hides descendants of collapsed
// groups, tags collapsed groups so the layouter sizes them as pills, aggregates
// edges onto the pill, and switches their type so React Flow renders edges to
// them. The layout then handles everything else — so collapsing all groups
// naturally produces a compact force-layout of pills instead of leaving them
// spread across the original hull label positions.
function applyCollapseTransform({ nodes, edges }, collapsedSet) {
  if (collapsedSet.size === 0) return { nodes, edges };

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const parentOf = (id) => nodeById.get(id)?.parentId;

  const effectiveId = new Map();
  const memberCount = new Map();
  nodes.forEach((n) => {
    let outermost = null;
    let cur = n.id;
    while (cur) {
      if (collapsedSet.has(cur)) outermost = cur;
      cur = parentOf(cur);
    }
    effectiveId.set(n.id, outermost || n.id);
    if (outermost && outermost !== n.id && n.type !== 'group') {
      memberCount.set(outermost, (memberCount.get(outermost) || 0) + 1);
    }
  });

  const filteredNodes = nodes
    .filter((n) => effectiveId.get(n.id) === n.id)
    .map((n) => {
      if (!collapsedSet.has(n.id)) return n;
      // Switch to collapsed_group type so React Flow's edge renderer doesn't
      // filter edges to/from it (as it does for 'group' container nodes).
      // A collapsed group no longer has parent semantics.
      const { parentId: _pid, extent: _ext, ...rest } = n;
      return {
        ...rest,
        type: 'collapsed_group',
        // A collapsed group is an endpoint like any concept, so it sits above the labels too.
        zIndex: NODE_Z,
        data: { ...n.data, collapsed: true, memberCount: memberCount.get(n.id) || 0 },
      };
    });

  // Rewire and aggregate edges.
  const aggregated = new Map();
  edges.forEach((e) => {
    const s = effectiveId.get(e.source) || e.source;
    const t = effectiveId.get(e.target) || e.target;
    if (s === t) return;
    const key = `${s}::${t}`;
    let bucket = aggregated.get(key);
    if (!bucket) {
      bucket = { source: s, target: t, originals: [] };
      aggregated.set(key, bucket);
    }
    bucket.originals.push(e);
  });

  const finalEdges = [];
  aggregated.forEach(({ source, target, originals }) => {
    const untouched = originals.length === 1 && originals[0].source === source && originals[0].target === target;
    if (untouched) {
      finalEdges.push(originals[0]);
      return;
    }
    // Aggregated edges show only the count — once a group-to-group connection
    // represents multiple underlying relationships, individual labels lose
    // meaning, so use the count as the sole label for consistency.
    const first = originals[0];
    const count = originals.length;
    finalEdges.push({
      ...first,
      id: `col-${source}-${target}`,
      source,
      target,
      label: `× ${count}`,
    });
  });

  return { nodes: filteredNodes, edges: finalEdges };
}

// Toggle button style helper
/**
 * A square icon button, stacked with its siblings down the edge of the canvas.
 *
 * Labels cost horizontal room the graph now needs — "Show as Entity-Relationship-Diagram" was wider
 * than the canvas it sat on once the panels stopped overlapping it. A glyph cannot say "on" by
 * itself, so the pressed state is carried by the button: filled, tinted and outlined, with the words
 * still available as a title.
 */
const toggleBtnStyle = (active) => ({
  width: 32,
  height: 32,
  borderRadius: 6,
  background: active ? '#eef2ff' : '#fff',
  padding: 0,
  color: active ? '#4f46e5' : '#4b5563',
  boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
  border: `1px solid ${active ? '#a5b4fc' : '#d1d5db'}`,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
});

// Past this many foreign-namespace concepts the diagram is more borrowed than its own, so they
// all start hidden and the namespace dropdown becomes the way back in.
const FOREIGN_NAMESPACE_LIMIT = 10;

/** Sized here rather than in each glyph so the four stay on one grid. */
const toolbarIconStyle = { width: 17, height: 17, display: 'block' };

export default function App({
  graphData,
  customHeight,
  layout,
  storageKey,
  showMiniMap,
  changesOnly: changesOnlyProp,
  focus,
  onSelect,
}) {
  const { t } = useTranslation();
  const { fitView, getNodes, zoomIn, zoomOut, setCenter, getViewport, getNodesBounds } = useReactFlow();
  const store = useStoreApi();
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  // React Flow's own measurement, so centring is driven by the number it uses rather than a copy.
  const flowWidth = useStore((state) => state.width);
  const [selectedNode, setSelectedNode] = useState(null);
  // Whether the host took the last selection and is showing that element itself, in which case a
  // panel here would be a second account of one thing. Set for the element the host focuses on
  // arrival, too — otherwise every page load opens a panel nobody asked for.
  const [panelClaimed, setPanelClaimed] = useState(true);
  const [selectedEdge, setSelectedEdge] = useState(null);
  // Default to ERD mode when a property is highlighted — otherwise the highlight
  // (which lives inside an entity node's property list) wouldn't be visible.
  const hasHighlightedProperty = useMemo(
    () => graphData.nodes.some((n) => (n.data?.properties || []).some((p) => p.highlight)),
    [graphData],
  );
  // Read once on mount; subsequent reads happen ad-hoc inside the persistence callbacks.
  const initialStored = useMemo(() => loadLayout(storageKey), [storageKey]);
  const initialToggles = initialStored?.toggles;
  const [showProperties, setShowProperties] = useState(
    initialToggles?.showProperties ?? hasHighlightedProperty,
  );
  const hasGroups = useMemo(
    () => graphData.nodes.some((n) => n.type === 'group'),
    [graphData],
  );
  const [showGroups, setShowGroups] = useState(initialToggles?.showGroups ?? false);
  // Off unless the host asks: a review page opens on what is being reviewed, but an embed that merely
  // renders a branch's graph should show the whole picture. Inert when there is no diff either way.
  const [changesOnly, setChangesOnly] = useState(changesOnlyProp ?? false);
  useEffect(() => {
    if (changesOnlyProp !== undefined) setChangesOnly(changesOnlyProp);
  }, [changesOnlyProp]);
  const [collapsedGroups, setCollapsedGroups] = useState(
    () => new Set(initialToggles?.collapsedGroups || []),
  );
  // Concepts borrowed from other namespaces, counted per namespace so the dropdown can say
  // how much each one contributes before the user decides to bring it back.
  const foreignNamespaces = useMemo(() => {
    const counts = new Map();
    graphData.nodes.forEach((n) => {
      const ns = n.data?.foreignNamespace;
      if (!ns) return;
      counts.set(ns, (counts.get(ns) || 0) + 1);
    });
    return Array.from(counts, ([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [graphData]);
  const [hiddenNamespaces, setHiddenNamespaces] = useState(() => {
    if (initialToggles?.hiddenNamespaces) return new Set(initialToggles.hiddenNamespaces);
    const total = foreignNamespaces.reduce((sum, ns) => sum + ns.count, 0);
    return total > FOREIGN_NAMESPACE_LIMIT
      ? new Set(foreignNamespaces.map((ns) => ns.name))
      : new Set();
  });
  // Reframe after the node set changes, the way the other toolbar toggles do.
  const refit = useCallback(() => {
    setTimeout(() => fitView({ padding: 0.1, maxZoom: 1.5 }), 0);
  }, [fitView]);
  const toggleNamespace = useCallback((name) => {
    setHiddenNamespaces((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    refit();
  }, [refit]);
  const setAllNamespaces = useCallback((mode) => {
    setHiddenNamespaces(mode === 'hide' ? new Set(foreignNamespaces.map((ns) => ns.name)) : new Set());
    refit();
  }, [foreignNamespaces, refit]);
  // Bumped by the relayout button, so the layout is computed again once the saved positions are
  // cleared. The layout itself is deterministic: the count only makes the memo run.
  const [layoutSeed, setLayoutSeed] = useState(0);
  const isHierarchy = layout === 'tree';
  const groupsActive = hasGroups && showGroups && !isHierarchy;
  // A request whose only change is to a concept's own property marks no node and no edge — the
  // property is not either. Without counting it the changes-only toggle disappears on exactly the
  // request that needs it.
  const hasDiff = useMemo(
    () => graphData.nodes.some((n) => n.data?.diff || n.data?.changedPropertyCount > 0) ||
      graphData.edges.some((e) => e.diff),
    [graphData],
  );
  const nodeTypes = showProperties && !isHierarchy ? entityNodeTypes : defaultNodeTypes;

  // Toggling produces a fresh Set so memoized consumers (layout, context) invalidate cleanly.
  const toggleCollapse = useCallback((groupId) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  // Collapses every group that sits at the same parent level as `groupId`
  // except `groupId` itself. Handy for isolating one group visually.
  const collapseOthers = useCallback((groupId) => {
    const target = graphData.nodes.find((n) => n.id === groupId);
    if (!target) return;
    const parentId = target.parentId || null;
    const siblings = graphData.nodes.filter((n) =>
      n.type === 'group' &&
      n.id !== groupId &&
      (n.parentId || null) === parentId
    );
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      siblings.forEach((s) => next.add(s.id));
      next.delete(groupId);
      return next;
    });
  }, [graphData]);

  const expandAll = useCallback(() => {
    setCollapsedGroups(new Set());
  }, []);

  const collapseAll = useCallback(() => {
    const ids = graphData.nodes.filter((n) => n.type === 'group').map((n) => n.id);
    setCollapsedGroups(new Set(ids));
  }, [graphData]);

  const allGroupsCollapsed = useMemo(() => {
    const groupIds = graphData.nodes.filter((n) => n.type === 'group').map((n) => n.id);
    return hasGroups && groupIds.every((id) => collapsedGroups.has(id));
  }, [graphData, collapsedGroups, hasGroups]);

  const toggleCollapseAll = useCallback(() => {
    if (allGroupsCollapsed) expandAll();
    else collapseAll();
  }, [allGroupsCollapsed, expandAll, collapseAll]);

  // Position persistence is scoped per "mode" — flat/groups/tree × simple/erd —
  // because positions from one mode (e.g. groups expanded) don't make sense in another.
  const modeKey = `${isHierarchy ? 'tree' : groupsActive ? 'groups' : 'flat'}:${showProperties ? 'erd' : 'simple'}`;

  const overlaySavedPositions = useCallback((nodes) => {
    const data = loadLayout(storageKey);
    const saved = data?.positions?.[modeKey];
    if (!saved) return nodes;
    return nodes.map((n) => (saved[n.id] ? { ...n, position: saved[n.id] } : n));
  }, [storageKey, modeKey]);

  // True when the server returned a search-filtered subgraph (presence of any
  // context node — searchMatch === false — is the signal). When filtered, the
  // saved drag-position overlay is skipped so the fresh force layout actually
  // shows; dragging is also not persisted, to avoid polluting the unfiltered
  // map with positions from a small subset.
  const isFiltered = useMemo(
    () => graphData.nodes.some((n) => n.data?.searchMatch === false),
    [graphData],
  );

  // Persist toggles whenever they change.
  useEffect(() => {
    saveToggles(storageKey, {
      showProperties,
      showGroups,
      collapsedGroups: Array.from(collapsedGroups),
      hiddenNamespaces: Array.from(hiddenNamespaces),
    });
  }, [storageKey, showProperties, showGroups, collapsedGroups, hiddenNamespaces]);

  const onNodeDragStop = useCallback(() => {
    if (isFiltered) return;
    savePositions(storageKey, modeKey, getNodes());
  }, [storageKey, modeKey, getNodes, isFiltered]);

  // Relayout: discards the positions saved for the current mode and computes the layout again,
  // which puts back the one arrangement the layout gives this graph. It used to roll a new
  // arrangement each click, so a layout someone liked could not be had back.
  const relayout = useCallback(() => {
    clearPositions(storageKey, modeKey);
    setLayoutSeed((s) => s + 1);
  }, [storageKey, modeKey]);

  const groupActions = useMemo(
    () => ({ toggleCollapse, collapsedSet: collapsedGroups }),
    [toggleCollapse, collapsedGroups],
  );

  const layouted = useMemo(() => {
    let sourceData = graphData;
    // Drop hidden foreign concepts (and the edges reaching them) before layout, so the
    // remaining concepts get the whole canvas instead of the gaps left behind.
    if (hiddenNamespaces.size > 0) {
      const filteredNodes = sourceData.nodes.filter(
        (n) => !(n.data?.foreignNamespace && hiddenNamespaces.has(n.data.foreignNamespace)),
      );
      const keepIds = new Set(filteredNodes.map((n) => n.id));
      const filteredEdges = sourceData.edges.filter((e) => keepIds.has(e.source) && keepIds.has(e.target));
      sourceData = { nodes: filteredNodes, edges: filteredEdges };
    }
    // Hide what the branch leaves alone — but keep whatever the changed concepts connect to.
    // A concept shown alone says nothing about whether changing it is safe; its neighbours are what
    // make a removal at a hub look different from a removal at a leaf. Neighbours come through
    // dimmed, the treatment search context already uses.
    if (changesOnly && hasDiff) {
      // A concept whose only change is to one of its own properties carries no diff of its own —
      // the property is not a node, so the change lands on the concept as a count.
      const changedIds = new Set(
        sourceData.nodes.filter((n) => n.data?.diff || n.data?.changedPropertyCount > 0).map((n) => n.id),
      );
      // A relationship can change between two concepts that are themselves untouched. Both ends
      // count as changed, or the only thing the request actually did would be filtered away.
      sourceData.edges.forEach((e) => {
        if (!e.diff) return;
        changedIds.add(e.source);
        changedIds.add(e.target);
      });
      const neighbourIds = new Set();
      sourceData.edges.forEach((e) => {
        if (changedIds.has(e.source)) neighbourIds.add(e.target);
        if (changedIds.has(e.target)) neighbourIds.add(e.source);
      });
      const filteredNodes = sourceData.nodes
        .filter((n) => changedIds.has(n.id) || neighbourIds.has(n.id) || n.type === 'group')
        .map((n) => (changedIds.has(n.id) || n.type === 'group'
          ? n
          : { ...n, data: { ...n.data, dimmed: true } }));
      const keepIds = new Set(filteredNodes.map((n) => n.id));
      const filteredEdges = sourceData.edges.filter((e) => keepIds.has(e.source) && keepIds.has(e.target));
      sourceData = { nodes: filteredNodes, edges: filteredEdges };
    }
    if (showProperties && !isHierarchy) {
      // Filters compose: this reads from whatever the step above produced, not from the original
      // graph. Reading from graphData discarded the changes-only filter, so turning on the
      // entity-relationship view silently put every unchanged concept back.
      const filteredNodes = sourceData.nodes.filter((n) => n.type !== 'shared_property');
      const keepIds = new Set(filteredNodes.map((n) => n.id));
      const filteredEdges = sourceData.edges.filter((e) => keepIds.has(e.source) && keepIds.has(e.target));
      sourceData = { nodes: filteredNodes, edges: filteredEdges };
    }
    if (!groupsActive) {
      const filteredNodes = sourceData.nodes
        .filter((n) => n.type !== 'group')
        .map(({ parentId, ...rest }) => rest);
      const keepIds = new Set(filteredNodes.map((n) => n.id));
      const filteredEdges = sourceData.edges.filter((e) => keepIds.has(e.source) && keepIds.has(e.target));
      sourceData = { nodes: filteredNodes, edges: filteredEdges };
    } else if (collapsedGroups.size > 0) {
      // Apply the collapse transform BEFORE layout so collapsed groups enter
      // the force-sim as pills — this packs them naturally when many are
      // collapsed, instead of leaving them spread across the original hulls.
      sourceData = applyCollapseTransform(sourceData, collapsedGroups);
    }
    const { nodes: rawNodes, edges: rawEdges } = toReactFlowElements(sourceData, { entityMode: showProperties && !isHierarchy });
    if (isHierarchy) return treeLayout(rawNodes, rawEdges);
    if (groupsActive) return layoutWithGroups(rawNodes, rawEdges, { entityMode: showProperties });
    return layoutElements(rawNodes, rawEdges, { entityMode: showProperties });
  }, [graphData, showProperties, isHierarchy, groupsActive, collapsedGroups, layoutSeed, changesOnly, hasDiff, hiddenNamespaces]);

  const adjacency = useMemo(
    () => buildAdjacency(layouted.edges),
    [layouted.edges],
  );

  // Hiding a namespace can take the inspected concept off the canvas — close the panel with it.
  useEffect(() => {
    if (selectedNode && !layouted.nodes.some((n) => n.id === selectedNode.id)) {
      setSelectedNode(null);
    }
  }, [layouted.nodes, selectedNode]);

  // Apply highlight/dim based on selected node, falling back to search context
  // when nothing is selected. Server tags non-match leaves with searchMatch=false
  // when a search returned 1-hop neighbors as context — we dim those to keep
  // the eye on actual hits. Groups don't carry searchMatch (defaults true) so
  // they're never dimmed by search alone. Click-selection always wins over
  // search dimming so clicking a context node lets the user explore from it.
  const displayNodes = useMemo(() => {
    // Selecting a relationship reduces the graph to the two concepts it joins — the pair is the
    // whole subject of the panel.
    if (selectedEdge) {
      const ends = new Set([selectedEdge.source, selectedEdge.target]);
      return layouted.nodes.map((node) => ({
        ...node,
        data: { ...node.data, dimmed: !ends.has(node.id), selected: false },
      }));
    }
    if (selectedNode) {
      const activeNodes = new Set([selectedNode.id]);
      (adjacency.neighborNodes[selectedNode.id] || new Set()).forEach((id) => activeNodes.add(id));
      // selected is passed separately from dimmed so the clicked node stands
      // out against its (equally undimmed) 1-hop neighbors.
      return layouted.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          dimmed: !activeNodes.has(node.id),
          selected: node.id === selectedNode.id,
        },
      }));
    }
    const hasContext = layouted.nodes.some((n) => n.data?.searchMatch === false);
    if (!hasContext) return layouted.nodes;
    // Group containers fade too — when searching, the user wants their eye on
    // the matched concepts, not the organizational hulls around them. The
    // matches stay at full saturation; everything else (context leaves and
    // group/collapsed-group containers) recedes.
    return layouted.nodes.map((node) => {
      const isContainer = node.type === 'group' || node.type === 'collapsed_group';
      const shouldDim = isContainer || node.data?.searchMatch === false;
      return { ...node, data: { ...node.data, dimmed: shouldDim } };
    });
  }, [layouted.nodes, selectedNode, selectedEdge, adjacency]);

  const displayEdges = useMemo(() => {
    if (selectedEdge) {
      return layouted.edges.map((edge) => {
        if (edge.id === selectedEdge.id) {
          return { ...edge, style: { ...edge.style, strokeWidth: 3.5 }, zIndex: 10 };
        }
        return {
          ...edge,
          style: { ...edge.style, stroke: '#e2e8f0', strokeWidth: 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#e2e8f0', width: 14, height: 14 },
          data: { ...edge.data, dimmed: true },
          labelStyle: { fontSize: 10, fill: '#e2e8f0', fontWeight: 500 },
          labelBgStyle: { fill: '#fff', fillOpacity: 0.5 },
          zIndex: 0,
        };
      });
    }
    if (selectedNode) {
      const activeEdges = adjacency.neighborEdges[selectedNode.id] || new Set();
      return layouted.edges.map((edge) => {
        const active = activeEdges.has(edge.id);
        // Selecting a concept must not erase the diff channel — a changed relationship keeps its
        // own colour and only borrows the selection's emphasis.
        const diff = DIFF_STYLES[edge.data?.diff];
        const activeStroke = diff ? diff.color : '#6366f1';
        return {
          ...edge,
          style: {
            ...edge.style,
            stroke: active ? activeStroke : '#e2e8f0',
            strokeWidth: active ? 2.5 : 1,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: active ? activeStroke : '#e2e8f0',
            width: 14,
            height: 14,
          },
          data: { ...edge.data, dimmed: !active },
          labelStyle: active
            ? { fontSize: 11, fill: diff ? activeStroke : '#4338ca', fontWeight: diff ? 700 : 600 }
            : { fontSize: 10, fill: '#e2e8f0', fontWeight: 500 },
          labelBgStyle: active
            ? { fill: '#eef2ff', fillOpacity: 1 }
            : { fill: '#fff', fillOpacity: 0.5 },
          zIndex: active ? 10 : 0,
        };
      });
    }
    // Changes only, with nothing selected: the diff is the subject and the neighbours are context,
    // so a relationship the proposal does not touch reads as background. Without this the dimmed
    // nodes were joined by full-strength lines and labels, which drew the eye to the context.
    if (changesOnly && hasDiff) {
      return layouted.edges.map((edge) => (edge.data?.diff ? edge : {
        ...edge,
        style: { ...edge.style, stroke: '#e2e8f0', strokeWidth: 1 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#e2e8f0', width: 14, height: 14 },
        data: { ...edge.data, dimmed: true },
        labelStyle: { fontSize: 10, fill: '#cbd5e1', fontWeight: 500 },
        labelBgStyle: { fill: '#fff', fillOpacity: 0.6 },
        zIndex: 0,
      }));
    }
    // Search context: dim edges where either endpoint is a non-match (the
    // server already drops context↔context edges, so what remains is
    // match↔match — kept full — and match↔context — dimmed).
    const matchIds = new Set(
      layouted.nodes.filter((n) => n.data?.searchMatch !== false).map((n) => n.id),
    );
    const hasContext = matchIds.size < layouted.nodes.length;
    if (!hasContext) return layouted.edges;
    return layouted.edges.map((edge) => {
      const fullyMatched = matchIds.has(edge.source) && matchIds.has(edge.target);
      if (fullyMatched) return edge;
      return {
        ...edge,
        style: { stroke: '#e2e8f0', strokeWidth: 1 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#e2e8f0',
          width: 14,
          height: 14,
        },
        data: { ...edge.data, dimmed: true },
        labelStyle: { fontSize: 10, fill: '#e2e8f0', fontWeight: 500 },
        labelBgStyle: { fill: '#fff', fillOpacity: 0.5 },
      };
    });
  }, [layouted.edges, selectedNode, selectedEdge, adjacency, layouted.nodes, changesOnly, hasDiff]);

  // Initial state: skip the saved-position overlay when mounting with a
  // filtered subgraph. HTMX morph re-mounts this component on each search
  // (the .semantic-visualizer container is replaced), so the graphData prop
  // is always fresh on mount — meaning the dataChanged branch below never
  // catches search transitions. ReactFlow's fitView prop reframes
  // automatically once positions are set, so no explicit fitView call here.
  const [nodes, setNodes, onNodesChange] = useNodesState(
    isFiltered ? displayNodes : overlaySavedPositions(displayNodes),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(displayEdges);

  // Relationship labels go to free space on their edges, re-placed whenever a concept moves (a
  // drag, a relayout) or the edges restyle (a selection). `storeNodes` changes on every such move
  // and on measurement; the node lookup it goes with is where the absolute positions are.
  const storeNodes = useStore((state) => state.nodes);
  const nodeLookup = useStore((state) => state.nodeLookup);
  const domNode = useStore((state) => state.domNode);
  const measureLabel = useMemo(
    () => makeLabelMeasurer(domNode ? getComputedStyle(domNode).fontFamily : 'sans-serif'),
    [domNode],
  );
  const labelPlacements = useMemo(
    () => placeEdgeLabels(edges, nodeLookup, measureLabel),
    [edges, storeNodes, nodeLookup, measureLabel],
  );
  // A label with no free spot shows while its edge or one of its concepts is hovered or selected.
  const [hovered, setHovered] = useState(null);
  const revealedLabels = useMemo(() => {
    const ids = new Set();
    const focusIds = new Set([hovered?.node, selectedNode?.id].filter(Boolean));
    edges.forEach((e) => {
      if (focusIds.has(e.source) || focusIds.has(e.target)) ids.add(e.id);
    });
    if (hovered?.edge) ids.add(hovered.edge);
    if (selectedEdge) ids.add(selectedEdge.id);
    return ids;
  }, [edges, hovered, selectedNode, selectedEdge]);
  const edgeLabels = useMemo(
    () => ({ placements: labelPlacements, revealed: revealedLabels }),
    [labelPlacements, revealedLabels],
  );
  const onEdgeMouseEnter = useCallback((_event, edge) => setHovered({ edge: edge.id }), []);
  const onNodeMouseEnter = useCallback((_event, node) => setHovered({ node: node.id }), []);
  const onHoverEnd = useCallback(() => setHovered(null), []);

  const [prevLayouted, setPrevLayouted] = useState(layouted);
  const [prevDisplayEdges, setPrevDisplayEdges] = useState(displayEdges);
  const [prevGraphData, setPrevGraphData] = useState(graphData);

  // When layout changes, apply new positions. Two cases:
  //   1. Filter result arrived (graphData identity changed AND filter active):
  //      trust the fresh force layout and reframe, since saved positions from
  //      the unfiltered view would scatter the small result across stale
  //      coordinates.
  //   2. Mode toggle (same graphData, or filter cleared): overlay saved
  //      drag-positions so the user keeps their hand-arranged layout.
  if (layouted !== prevLayouted) {
    setPrevLayouted(layouted);
    const dataChanged = graphData !== prevGraphData;
    if (dataChanged) setPrevGraphData(graphData);
    if (dataChanged && isFiltered) {
      setNodes(displayNodes);
      setTimeout(() => fitView({ padding: 0.1, maxZoom: 1.5 }), 0);
    } else {
      setNodes(overlaySavedPositions(displayNodes));
    }
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

  /**
   * Bring the selected element to the middle of the canvas.
   *
   * Not the same job as getting a node out from under a panel, though one function used to do both —
   * and removing the overlap took this with it. Selecting a card in the list has to move the canvas
   * to it, because the reader's whole reason for clicking is to see where it sits; and opening the
   * panel narrows the canvas, which shifts what is visible even when nothing is covering it.
   */
  const focusNode = useCallback((node) => {
    if (!node) return;
    // With the lookup, so a node inside a group is measured where it actually sits.
    const bounds = getNodesBounds([node], { nodeLookup: store.getState().nodeLookup });
    if (!bounds || !bounds.width) return;
    setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, {
      zoom: getViewport().zoom,
      duration: 400,
    });
  }, [getNodesBounds, getViewport, setCenter, store]);

  /**
   * Centre on the selection, once, when React Flow knows how wide it is.
   *
   * Centring at click time computes against the canvas as it was: selecting the first change opens
   * the detail panel and narrows the canvas, and React Flow measures itself asynchronously. The
   * first attempt at this centred immediately and corrected afterwards, which is two pans for every
   * click — a fast move and then a small step.
   *
   * Depending on React Flow's own width instead means the centring happens when the value it is
   * computed from actually changes: once per selection, and once more only when the canvas really
   * did resize under it.
   */
  useEffect(() => {
    if (selectedNode) focusNode(selectedNode);
  }, [selectedNode, flowWidth, focusNode]);

  // Full screen uses the browser's full-screen mode for the host element, so the detail panel comes
  // along; Esc leaves it. Where the browser does not allow it (some embeds, iOS), the graph stretches
  // to the window height instead. Either way the graph is framed afresh for its new size, the way the
  // embed first framed it: a zoom carried over from a short embed leaves it small in an empty screen,
  // and one carried back crops it. A selection wins, as the effect above recentres on it too once the
  // canvas has resized.
  const [fullScreen, setFullScreen] = useState(false);
  const inFullScreen = useRef(false);
  const hostElement = () => containerRef.current?.closest('.semantic-visualizer');

  const reframe = useCallback(() => {
    // Two frames: the first lets the container take its new size, the second frames in it.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (selectedNode) {
        focusNode(selectedNode);
      } else {
        fitView({ padding: 0.1, maxZoom: 1.5 });
      }
    }));
  }, [selectedNode, focusNode, fitView]);

  useEffect(() => {
    const onChange = () => {
      const host = hostElement();
      const now = Boolean(host) && document.fullscreenElement === host;
      // Every visualizer on the page hears this, and the way out may be Esc rather than the button,
      // so what decides is whether this one's own element went in or came out.
      if (now === inFullScreen.current) return;
      inFullScreen.current = now;
      setFullScreen(now);
      reframe();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [reframe]);

  const stretch = (host, stretched) => {
    host.style.height = stretched ? '100vh' : (customHeight || '400px');
    setFullScreen(stretched);
    host.scrollIntoView(true);
    reframe();
  };
  const toggleFullScreen = () => {
    const host = hostElement();
    if (!host) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (fullScreen) {
      stretch(host, false);
    } else if (document.fullscreenEnabled && host.requestFullscreen) {
      host.requestFullscreen().catch(() => stretch(host, true));
    } else {
      stretch(host, true);
    }
  };

  /**
   * Centre on what the host says is being read.
   *
   * The graph is beside a page about one element, so it opens on that element rather than on the
   * whole picture with the reader left to find it. Marked selected as well as centred: a node in the
   * middle of a canvas is not obviously the subject unless it says so.
   */
  const focusedRef = useRef(null);
  useEffect(() => {
    if (!focus || focusedRef.current === focus) return;
    const node = getNodes().find((n) => n.data?.externalId === focus);
    // Retried through `nodes` because the first render has none yet — and guarded by the ref because
    // selecting one recomputes them, which without it is a loop that renders until React gives up.
    if (!node) return;
    focusedRef.current = focus;
    // The host is already showing this one — that is why it asked for it to be centred.
    setPanelClaimed(true);
    setSelectedNode(node);
  }, [focus, getNodes, nodes]);

  const onNodeClick = useCallback((event, node) => {
    setSelectedEdge(null);
    const deselecting = selectedNode?.id === node.id;
    setSelectedNode(deselecting ? null : node);

    // A host may own what a click means — the review does, where picking a changed node is picking
    // which change to read, and the page that shows it is not this component. Reported by stable id,
    // the only identifier that means anything outside this process.
    //
    // Whether it owns *this* click is its answer, not a standing arrangement: a review has a page for
    // the elements a proposal touches and none for the neighbours drawn around them. Handing an
    // unclaimed click back is what lets the panel describe those, as it does anywhere else.
    const claimed = Boolean(onSelect) && !deselecting && Boolean(node.data?.externalId) &&
      onSelect(node.data.externalId, node) === true;
    setPanelClaimed(claimed);
  }, [selectedNode, onSelect]);

  // A relationship is a change in its own right, so it has to be inspectable on its own — the panel
  // is the only place a reader can see what the branch did to one.
  const onEdgeClick = useCallback((_event, edge) => {
    setSelectedNode(null);
    setSelectedEdge((prev) => prev?.id === edge.id ? null : edge);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);


  // Kept together so the toolbar can live in its own row above the panels rather than under them.
  const viewControls = (
    // Down the edge rather than across the top: the canvas is the scarce dimension once the panels
    // sit beside it, and a column costs one icon's width instead of four buttons' worth.
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        {/* Wider than the glyphs below it, and only present when the diagram actually reaches into
            another namespace — which is why the column aligns to its right edge rather than
            stretching every button to this one's width. */}
        {foreignNamespaces.length > 0 && (
          <NamespaceFilter
            namespaces={foreignNamespaces}
            hidden={hiddenNamespaces}
            onToggle={toggleNamespace}
            onSetAll={setAllNamespaces}
          />
        )}
        {hasDiff && (
          <button
            onClick={() => {
              setChangesOnly((v) => !v);
              setTimeout(() => fitView({ padding: 0.1, maxZoom: 1.5 }), 0);
            }}
            style={toggleBtnStyle(changesOnly)}
            onMouseOver={(e) => { if (!changesOnly) e.currentTarget.style.background = '#f9fafb'; }}
            onMouseOut={(e) => { if (!changesOnly) e.currentTarget.style.background = '#fff'; }}
            title={t('toolbar.changesOnly.title')}
                aria-label={t('toolbar.changesOnly.label')}
                aria-pressed={changesOnly}
          >
            <span style={toolbarIconStyle} aria-hidden="true">{changesOnlyIcon}</span>
          </button>
        )}
        {!isHierarchy && hasGroups && (
          <button
            onClick={() => {
              setShowGroups((v) => !v);
              setTimeout(() => fitView({ padding: 0.1, maxZoom: 1.5 }), 0);
            }}
            style={toggleBtnStyle(showGroups)}
            onMouseOver={(e) => { if (!showGroups) e.currentTarget.style.background = '#f9fafb'; }}
            onMouseOut={(e) => { if (!showGroups) e.currentTarget.style.background = '#fff'; }}
            title={t('toolbar.showGroups.title')}
                aria-label={t('toolbar.showGroups.label')}
                aria-pressed={showGroups}
          >
            <span style={toolbarIconStyle} aria-hidden="true">{groupsIcon}</span>
          </button>
        )}
        {/* Next to the groups toggle it acts on, and only while groups are shown: with them hidden
            there is nothing to collapse. An action rather than a state, so never drawn pressed. */}
        {!isHierarchy && hasGroups && showGroups && (
          <button
            onClick={() => {
              toggleCollapseAll();
              setTimeout(() => fitView({ padding: 0.1, maxZoom: 1.5 }), 50);
            }}
            style={toggleBtnStyle(false)}
            onMouseOver={(e) => { e.currentTarget.style.background = '#f9fafb'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = '#fff'; }}
            title={allGroupsCollapsed ? t('controls.expandAll') : t('controls.collapseAll')}
            aria-label={allGroupsCollapsed ? t('controls.expandAll') : t('controls.collapseAll')}
          >
            <span style={toolbarIconStyle} aria-hidden="true">{allGroupsCollapsed ? expandAllIcon : collapseAllIcon}</span>
          </button>
        )}
        {!isHierarchy && (
          <button
            onClick={() => {
              setShowProperties((v) => !v);
              setTimeout(() => fitView({ padding: 0.1, maxZoom: 1.5 }), 0);
            }}
            style={toggleBtnStyle(showProperties)}
            onMouseOver={(e) => { if (!showProperties) e.currentTarget.style.background = '#f9fafb'; }}
            onMouseOut={(e) => { if (!showProperties) e.currentTarget.style.background = '#fff'; }}
            title={t('toolbar.erd.title')}
                aria-label={t('toolbar.erd.label')}
                aria-pressed={showProperties}
          >
            <span style={toolbarIconStyle} aria-hidden="true">{erdIcon}</span>
          </button>
        )}
      </div>
  );

  return (
    <GroupActionsContext.Provider value={groupActions}>
    {/* A row, not a stack. The panels used to float over the canvas, which meant opening one hid the
        element it was describing — and every fix for that (panning the node back into view, offsetting
        the toolbar) was working around the overlap rather than removing it. Laid out side by side, the
        graph keeps whatever width is left and nothing is ever underneath anything. */}
    <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', minWidth: 0 }}>
      <div ref={canvasRef} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <EdgeLabelContext.Provider value={edgeLabels}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        zIndexMode="manual"
        fitView
        fitViewOptions={{ padding: 0.1, maxZoom: 1.5 }}
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
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodeDragStop={onNodeDragStop}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onHoverEnd}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onHoverEnd}
      >
        <Background color="#e2e8f0" gap={20} />
        <Controls position="bottom-left" showZoom={false} showFitView={false} showInteractive={false}>
          <ControlButton
            onClick={() => {
              relayout();
              setTimeout(() => fitView({ padding: 0.1, maxZoom: 1.5 }), 50);
            }}
            title={t('controls.autoLayout.title')}
            aria-label={t('controls.autoLayout.label')}
          >
            {autoLayoutIcon}
          </ControlButton>
          <ControlButton onClick={() => zoomIn()} title={t('controls.zoomIn')} aria-label={t('controls.zoomIn')}>
            {zoomInIcon}
          </ControlButton>
          <ControlButton onClick={() => zoomOut()} title={t('controls.zoomOut')} aria-label={t('controls.zoomOut')}>
            {zoomOutIcon}
          </ControlButton>
          <ControlButton
            onClick={() => fitView({ padding: 0.3, maxZoom: 1 })}
            title={t('controls.fitView')}
            aria-label={t('controls.fitView')}
          >
            {fitViewIcon}
          </ControlButton>
          <ControlButton
            onClick={toggleFullScreen}
            title={t(fullScreen ? 'controls.exitFullScreen' : 'controls.fullScreen')}
            aria-label={t(fullScreen ? 'controls.exitFullScreen' : 'controls.fullScreen')}
          >
            {fullScreen ? exitFullScreenIcon : enterFullScreenIcon}
          </ControlButton>
        </Controls>
        {showMiniMap && <MiniMap zoomable pannable />}
        <Panel position="top-right">{viewControls}</Panel>
      </ReactFlow>
      </EdgeLabelContext.Provider>
      </div>
      {/* Withheld only for the selections the host claimed — it answers those with its own account
          of the element, and two of them side by side is one too many. */}
      <DetailPanel
        node={panelClaimed ? null : selectedNode}
        changesOnly={changesOnly}
        edge={selectedEdge}
        graphData={graphData}
        isCollapsed={selectedNode ? collapsedGroups.has(selectedNode.id) : false}
        onToggleCollapse={toggleCollapse}
        onCollapseOthers={collapseOthers}
        onExpandAll={expandAll}
        onClose={() => { setSelectedNode(null); setSelectedEdge(null); }}
        wide={hasDiff}
      />
    </div>
    </GroupActionsContext.Provider>
  );
}
