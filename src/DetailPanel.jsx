import React from 'react';

const ACCENT_COLORS = {
  concept: '#3b82f6',
  property: '#22c55e',
  metric: '#8b5cf6',
};

const TYPE_LABELS = {
  concept: 'Concept',
  property: 'Property',
  metric: 'Metric',
};

const KeyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
  </svg>
);

export default function DetailPanel({ node, onClose }) {
  if (!node) return null;

  const type = node.type || 'concept';
  const accentColor = ACCENT_COLORS[type] || ACCENT_COLORS.concept;
  const { label, description, link, properties = [] } = node.data;
  const ownProperties = properties.filter((p) => !p.inherited);
  const inheritedProperties = properties.filter((p) => p.inherited);

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: 320,
      background: '#fff',
      borderLeft: '1px solid #e5e7eb',
      boxShadow: '-4px 0 12px rgba(0,0,0,0.08)',
      zIndex: 10,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Accent bar */}
      <div style={{ height: 4, background: accentColor, flexShrink: 0 }} />

      {/* Header */}
      <div style={{
        padding: '16px 16px 12px',
        borderBottom: '1px solid #e5e7eb',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: accentColor,
              marginBottom: 4,
            }}>
              {TYPE_LABELS[type] || 'Concept'}
            </div>
            <div style={{
              fontSize: 16,
              fontWeight: 700,
              color: '#111827',
              wordBreak: 'break-word',
            }}>
              {label}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: '#9ca3af',
              fontSize: 18,
              lineHeight: 1,
              flexShrink: 0,
              marginLeft: 8,
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {description && (
          <div style={{
            marginTop: 8,
            fontSize: 13,
            color: '#6b7280',
            lineHeight: 1.5,
          }}>
            {description}
          </div>
        )}

        {link && (
          <a
            href={link}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 10,
              fontSize: 12,
              fontWeight: 500,
              color: accentColor,
              textDecoration: 'none',
            }}
            onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
            onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
          >
            Open details →
          </a>
        )}
      </div>

      {/* Properties */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
        {ownProperties.length > 0 && (
          <PropertySection title="Properties" properties={ownProperties} count={ownProperties.length} />
        )}
        {inheritedProperties.length > 0 && (
          <PropertySection title="Inherited" properties={inheritedProperties} count={inheritedProperties.length} inherited />
        )}
        {properties.length === 0 && !description && (
          <div style={{ padding: 16, fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
            No properties
          </div>
        )}
      </div>
    </div>
  );
}

function PropertySection({ title, properties, count, inherited }) {
  return (
    <div>
      <div style={{
        padding: '10px 16px 6px',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: '#9ca3af',
        background: '#f9fafb',
        borderBottom: '1px solid #e5e7eb',
      }}>
        {title} ({count})
      </div>
      {properties.map((prop, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '7px 16px',
            borderBottom: '1px solid #f3f4f6',
            gap: 8,
          }}
        >
          <span style={{
            fontSize: 13,
            fontWeight: 500,
            color: inherited ? '#9ca3af' : '#374151',
            fontStyle: inherited ? 'italic' : 'normal',
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
              <span style={{
                fontSize: 11,
                color: '#9ca3af',
                background: '#f3f4f6',
                padding: '1px 6px',
                borderRadius: 3,
              }}>
                {prop.type}
              </span>
            )}
            {prop.primaryKey && <KeyIcon />}
          </div>
        </div>
      ))}
    </div>
  );
}
