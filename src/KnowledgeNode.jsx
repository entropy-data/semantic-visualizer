import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { DIFF_STYLES } from './diffStyles';

const ACCENT_COLORS = {
  entity: '#3b82f6',    // blue-500
  property: '#22c55e',   // green-500
  shared_property: '#22c55e',   // green-500
  metric: '#8b5cf6',     // violet-500
};

const BG_COLORS = {
  entity: '#eff6ff',    // blue-50
  property: '#f0fdf4',   // green-50
  shared_property: '#f0fdf4',   // green-50
  metric: '#f5f3ff',     // violet-50
};

// Icons matching the Thymeleaf element-icon.html fragment
const TYPE_ICONS = {
  entity: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="#60a5fa">
      <path d="M10.362 1.093a.75.75 0 0 0-.724 0L2.523 5.018 10 9.143l7.477-4.125-7.115-3.925ZM18 6.443l-7.25 4v8.25l6.888-3.8A.75.75 0 0 0 18 14.25V6.443ZM9.25 18.693v-8.25l-7.25-4v7.807a.75.75 0 0 0 .362.643l6.888 3.8Z"/>
    </svg>
  ),
  metric: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="#c084fc">
      <path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-1ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9A1.5 1.5 0 0 0 9.5 18h1a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 10.5 6h-1ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5A1.5 1.5 0 0 0 3.5 18h1A1.5 1.5 0 0 0 6 16.5v-5A1.5 1.5 0 0 0 4.5 10h-1Z"/>
    </svg>
  ),
  property: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="#4ade80">
      <path fillRule="evenodd" d="M4.5 2A2.5 2.5 0 0 0 2 4.5v3.879a2.5 2.5 0 0 0 .732 1.767l7.5 7.5a2.5 2.5 0 0 0 3.536 0l3.878-3.878a2.5 2.5 0 0 0 0-3.536l-7.5-7.5A2.5 2.5 0 0 0 8.38 2H4.5ZM5 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/>
    </svg>
  ),
  shared_property: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="#4ade80">
      <path fillRule="evenodd" d="M4.5 2A2.5 2.5 0 0 0 2 4.5v3.879a2.5 2.5 0 0 0 .732 1.767l7.5 7.5a2.5 2.5 0 0 0 3.536 0l3.878-3.878a2.5 2.5 0 0 0 0-3.536l-7.5-7.5A2.5 2.5 0 0 0 8.38 2H4.5ZM5 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/>
    </svg>
  ),
};


const handleStyle = { visibility: 'hidden', width: 6, height: 6 };

export default function KnowledgeNode({ data, type }) {
  const dimmed = data.dimmed;
  const accentColor = ACCENT_COLORS[type] || ACCENT_COLORS.entity;
  const bgColor = BG_COLORS[type] || BG_COLORS.entity;
  const icon = TYPE_ICONS[type] || TYPE_ICONS.entity;
  const diff = DIFF_STYLES[data.diff];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 14px',
      borderRadius: 20,
      background: dimmed ? '#f8fafc' : (data.unresolved ? '#fef2f2' : (data.externalNamespace ? '#f8fafc' : bgColor)),
      // A concept from another namespace is shown only because something here points at it. Dashed
      // and desaturated so it never reads as part of this namespace's own model.
      border: `2px ${(data.externalNamespace || data.unresolved) ? 'dashed' : 'solid'} ${dimmed ? '#e2e8f0' : (data.unresolved ? '#dc2626' : (diff ? diff.color : (data.externalNamespace ? '#cbd5e1' : accentColor)))}`,
      cursor: data.link ? 'pointer' : 'default',
      boxShadow: data.selected
        ? `0 0 0 3px #ffffff, 0 0 0 5px ${accentColor}, 0 0 16px ${accentColor}66`
        : data.highlight
        ? `0 0 0 3px ${accentColor}40, 0 0 16px ${accentColor}30`
        : diff
        ? `0 0 0 3px ${diff.color}33`
        : '0 1px 4px rgba(0,0,0,0.08)',
      whiteSpace: 'nowrap',
      minWidth: 0,
      opacity: dimmed ? 0.35 : 1,
      transition: 'opacity 0.2s, border-color 0.2s, background 0.2s, box-shadow 0.2s',
    }}>
      <Handle type="target" position={Position.Top} id="top" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right" style={handleStyle} />

      {diff && (
        <span style={{
          flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: 8,
          background: diff.color, color: '#fff',
          font: '700 11px/1 ui-sans-serif, system-ui, sans-serif',
        }}>{diff.symbol}</span>
      )}
      {/* Named by a relationship but present nowhere. Marked rather than hidden: a change request
          pointing at a concept that does not exist cannot be applied, and silently dropping the edge
          would show the reviewer an empty diff. */}
      {data.unresolved && (
        <span
          title="This concept does not exist"
          style={{
            flexShrink: 0, padding: '1px 6px', borderRadius: 8,
            background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5',
            font: '700 10px/1.4 ui-sans-serif, system-ui, sans-serif',
          }}
        >
          missing
        </span>
      )}
      {data.externalNamespace && (
        <span
          title={`Lives in namespace ${data.externalNamespace}`}
          style={{
            flexShrink: 0, padding: '1px 6px', borderRadius: 8,
            background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0',
            font: '600 10px/1.4 ui-sans-serif, system-ui, sans-serif',
          }}
        >
          ↗ {data.externalNamespace}
        </span>
      )}
      {/* Only its properties changed, so the concept itself carries no diff mark. Without this the
          node looks untouched and the change request reads as empty. */}
      {!diff && data.changedPropertyCount > 0 && (
        <span
          title={`${data.changedPropertyCount} of its properties change`}
          style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
            background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74',
            font: '700 10px/1 ui-sans-serif, system-ui, sans-serif',
          }}
        >
          {data.changedPropertyCount}
        </span>
      )}
      {/* Changed, but citing nothing. Marked on the node because a reviewer scanning a large
          proposal needs to see which parts are unsupported without opening each one. */}
      {data.evidenceMissing && (
        <span
          title="This change cites no source"
          style={{
            flexShrink: 0, padding: '1px 5px', borderRadius: 8,
            background: '#fef3c7', color: '#92400e', border: '1px dashed #fcd34d',
            font: '700 10px/1.4 ui-sans-serif, system-ui, sans-serif',
          }}
        >
          ?
        </span>
      )}
      {/* Another pending request edits this same element. Indigo rather than the diff or impact
          colours: it is not a property of this change, it is a warning about a different one. */}
      {data.overlaps?.length > 0 && (
        <span
          title={`Also edited by ${data.overlaps.length} other pending change request(s)`}
          style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 16, height: 16, borderRadius: 8,
            background: '#e0e7ff', color: '#4338ca', border: '1px solid #a5b4fc',
            font: '700 10px/1 ui-sans-serif, system-ui, sans-serif',
          }}
        >
          {data.overlaps.length > 1 ? data.overlaps.length : '⇄'}
        </span>
      )}
      {/* How many things break if this removal goes ahead. On the node itself because it is the one
          number that decides whether a removal is routine or serious, and a reviewer should not have
          to open anything to see it. */}
      {data.consumers?.total > 0 && (
        <span
          title={`${data.consumers.total} consumer(s) depend on this`}
          style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 2,
            padding: '1px 6px 1px 4px', borderRadius: 8,
            background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
            font: '700 10px/1.4 ui-sans-serif, system-ui, sans-serif',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 20 20" fill="#b45309" aria-hidden="true">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/>
          </svg>
          {data.consumers.total}
        </span>
      )}
      <span style={{ flexShrink: 0, display: 'flex' }}>{icon}</span>
      <span style={{
        fontWeight: 600,
        fontSize: 13,
        color: dimmed ? '#94a3b8' : '#1e293b',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {data.label}
      </span>
    </div>
  );
}
