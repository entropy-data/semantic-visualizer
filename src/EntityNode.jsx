import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';

const MAX_VISIBLE_PROPERTIES = 8;

const ACCENT_COLORS = {
  entity: '#3b82f6',    // blue-500
  property: '#22c55e',  // green-500
  metric: '#8b5cf6',    // violet-500
};

// Icons matching the Thymeleaf element-icon.html fragment
const TYPE_ICONS = {
  entity: (
    // Cube icon (blue)
    <svg width="16" height="16" viewBox="0 0 20 20" fill="#60a5fa">
      <path d="M10.362 1.093a.75.75 0 0 0-.724 0L2.523 5.018 10 9.143l7.477-4.125-7.115-3.925ZM18 6.443l-7.25 4v8.25l6.888-3.8A.75.75 0 0 0 18 14.25V6.443ZM9.25 18.693v-8.25l-7.25-4v7.807a.75.75 0 0 0 .362.643l6.888 3.8Z"/>
    </svg>
  ),
  metric: (
    // Chart bar icon (purple)
    <svg width="16" height="16" viewBox="0 0 20 20" fill="#c084fc">
      <path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-1ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9A1.5 1.5 0 0 0 9.5 18h1a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 10.5 6h-1ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5A1.5 1.5 0 0 0 3.5 18h1A1.5 1.5 0 0 0 6 16.5v-5A1.5 1.5 0 0 0 4.5 10h-1Z"/>
    </svg>
  ),
  property: (
    // Tag icon (green)
    <svg width="16" height="16" viewBox="0 0 20 20" fill="#4ade80">
      <path fillRule="evenodd" d="M4.5 2A2.5 2.5 0 0 0 2 4.5v3.879a2.5 2.5 0 0 0 .732 1.767l7.5 7.5a2.5 2.5 0 0 0 3.536 0l3.878-3.878a2.5 2.5 0 0 0 0-3.536l-7.5-7.5A2.5 2.5 0 0 0 8.38 2H4.5ZM5 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/>
    </svg>
  ),
};

const KeyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
  </svg>
);

const handleStyle = { visibility: 'hidden', width: 8, height: 8 };

export default function EntityNode({ data, type }) {
  const [expanded, setExpanded] = useState(false);
  const accentColor = ACCENT_COLORS[type] || ACCENT_COLORS.entity;
  const icon = TYPE_ICONS[type] || TYPE_ICONS.entity;
  const hideProperties = data.hideProperties;
  const allProperties = hideProperties ? [] : (data.properties || []);
  const hasMore = !expanded && allProperties.length > MAX_VISIBLE_PROPERTIES;
  const properties = hasMore ? allProperties.slice(0, MAX_VISIBLE_PROPERTIES) : allProperties;
  const hiddenCount = allProperties.length - MAX_VISIBLE_PROPERTIES;
  const description = data.description;

  const toggleExpand = (e) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  };

  return (
    <div style={{
      minWidth: 220,
      borderRadius: 6,
      overflow: 'hidden',
      cursor: data.link ? 'pointer' : 'default',
      boxShadow: data.highlight
        ? `0 0 0 2px ${accentColor}, 0 0 12px ${accentColor}40`
        : '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <Handle type="target" position={Position.Top} id="top" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={handleStyle} />

      {/* Accent bar */}
      <div style={{
        height: 6,
        background: accentColor,
      }} />

      {/* Node container */}
      <div style={{
        border: '3px solid #E9EEF4',
        borderTop: 'none',
        borderRadius: '0 0 6px 6px',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: '#E9EEF4',
          padding: '6px 10px',
          gap: 6,
        }}>
          <span style={{ flexShrink: 0, display: 'flex' }}>{icon}</span>
          <span style={{
            fontWeight: 700,
            fontSize: 14,
            color: '#111827',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {data.label}
          </span>
        </div>

        {/* Body */}
        <div style={{ background: '#fff' }}>
          {properties.length > 0 ? (
            <>
              {properties.map((prop, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '5px 10px',
                    borderTop: '1px solid #E9EEF4',
                    gap: 8,
                  }}
                >
                  <span style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: prop.inherited ? '#9ca3af' : '#111827',
                    fontStyle: prop.inherited ? 'italic' : 'normal',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0,
                  }}>
                    {prop.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {prop.type && (
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>
                        {prop.type}
                      </span>
                    )}
                    {prop.primaryKey && <KeyIcon />}
                  </div>
                </div>
              ))}
              {(hasMore || (expanded && allProperties.length > MAX_VISIBLE_PROPERTIES)) && (
                <div
                  onClick={toggleExpand}
                  style={{
                    padding: '4px 10px',
                    borderTop: '1px solid #E9EEF4',
                    fontSize: 11,
                    color: '#6366f1',
                    textAlign: 'center',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#f5f3ff'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {expanded ? 'show less' : `+${hiddenCount} more`}
                </div>
              )}
            </>
          ) : (
            <div style={{
              padding: '6px 10px',
              fontSize: 12,
              color: '#9ca3af',
              fontStyle: 'italic',
              lineHeight: 1.4,
            }}>
              No properties
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
