import React from 'react';
import { Handle, Position } from '@xyflow/react';

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

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 14px',
      borderRadius: 20,
      background: dimmed ? '#f8fafc' : bgColor,
      border: `2px solid ${dimmed ? '#e2e8f0' : accentColor}`,
      cursor: data.link ? 'pointer' : 'default',
      boxShadow: data.highlight
        ? `0 0 0 3px ${accentColor}40, 0 0 16px ${accentColor}30`
        : '0 1px 4px rgba(0,0,0,0.08)',
      whiteSpace: 'nowrap',
      minWidth: 0,
      opacity: dimmed ? 0.35 : 1,
      transition: 'opacity 0.2s, border-color 0.2s, background 0.2s',
    }}>
      <Handle type="target" position={Position.Top} id="top" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right" style={handleStyle} />

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
