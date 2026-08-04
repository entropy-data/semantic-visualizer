import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Handle, Position } from '@xyflow/react';
import { DIFF_STYLES } from './diffStyles';

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
  const { t } = useTranslation();
  const accentColor = ACCENT_COLORS[type] || ACCENT_COLORS.entity;
  const icon = TYPE_ICONS[type] || TYPE_ICONS.entity;
  const hideProperties = data.hideProperties;
  const allProperties = hideProperties ? [] : (data.properties || []);
  // Auto-expand if a highlighted or changed property would otherwise be hidden behind "+N more".
  // A change a reviewer has to click to discover is a change they will approve without reading.
  const highlightHidden = allProperties.some((p, i) => (p.highlight || p.diff) && i >= MAX_VISIBLE_PROPERTIES);
  const [expanded, setExpanded] = useState(highlightHidden);
  const hasMore = !expanded && allProperties.length > MAX_VISIBLE_PROPERTIES;
  const properties = hasMore ? allProperties.slice(0, MAX_VISIBLE_PROPERTIES) : allProperties;
  const hiddenCount = allProperties.length - MAX_VISIBLE_PROPERTIES;
  const description = data.description;

  const toggleExpand = (e) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  };

  // How a pending change request would affect this concept. Rendered as a ring and a corner label
  // rather than by recolouring the node, so the type accent still reads: a reviewer needs to see
  // *what* a concept is at the same time as what happens to it.
  const diff = DIFF_STYLES[data.diff];
  // A concept can be untouched itself and still be where the change lands, when the request only
  // edits one of its properties. The rows below say which one; this is what carries that across a
  // graph, where rows are unreadable until you zoom in.
  const changedProperties = data.changedPropertyCount || 0;
  const ring = diff || (changedProperties > 0 ? DIFF_STYLES.modify : null);
  const ringLabel = diff ? diff.label : t('node.propertiesChanged', { count: changedProperties });

  return (
    <div style={{
      minWidth: 220,
      borderRadius: 6,
      overflow: 'hidden',
      position: 'relative',
      // Context kept by the changes-only filter recedes. Without this an entity-relationship view
      // renders a changed concept's neighbours as loudly as the change itself.
      opacity: data.dimmed ? 0.4 : data.diff === 'remove' ? 0.65 : 1,
      cursor: data.link ? 'pointer' : 'default',
      boxShadow: ring
        ? `0 0 0 3px ${ring.color}, 0 0 14px ${ring.color}55`
        : data.selected
        ? `0 0 0 3px #ffffff, 0 0 0 5px ${accentColor}, 0 0 16px ${accentColor}66`
        : data.highlight
        ? `0 0 0 2px ${accentColor}, 0 0 12px ${accentColor}40`
        : '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {ring && (
        <div style={{
          position: 'absolute', top: 0, right: 0, zIndex: 1,
          background: ring.color, color: '#fff',
          font: '600 10px/1 ui-sans-serif, system-ui, sans-serif',
          letterSpacing: '0.06em', textTransform: 'uppercase',
          padding: '3px 6px', borderBottomLeftRadius: 6,
        }}>{ringLabel}</div>
      )}
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
              {properties.map((prop, i) => {
                // The rail and tint follow the diff colour rather than the property accent, so a
                // changed property reads the same as a changed concept or relationship elsewhere in
                // the graph. Search highlighting keeps the green accent it always had.
                const propDiff = DIFF_STYLES[prop.diff];
                const rail = propDiff ? propDiff.color : prop.highlight ? ACCENT_COLORS.property : null;
                return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '5px 10px',
                    borderTop: '1px solid #E9EEF4',
                    gap: 8,
                    background: rail ? `${rail}1a` : 'transparent',
                    boxShadow: rail ? `inset 3px 0 0 ${rail}` : 'none',
                  }}
                >
                  <span style={{
                    fontSize: 13,
                    fontWeight: prop.highlight || propDiff ? 700 : 500,
                    color: prop.inherited ? '#9ca3af' : '#111827',
                    fontStyle: prop.inherited ? 'italic' : 'normal',
                    textDecoration: prop.diff === 'remove' ? 'line-through' : 'none',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0,
                  }}>
                    {prop.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {propDiff ? (
                      <span style={{
                        color: propDiff.color,
                        font: '600 10px/1 ui-sans-serif, system-ui, sans-serif',
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                      }}>
                        {t(`detail.diff.op.${prop.diff}`)}
                      </span>
                    ) : prop.type && (
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>
                        {prop.type}
                      </span>
                    )}
                    {prop.primaryKey && <KeyIcon />}
                  </div>
                </div>
                );
              })}
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
              {t('node.noProperties')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
