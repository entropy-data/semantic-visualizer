import React from 'react';
import { Handle, Position } from '@xyflow/react';

export default function MetricNode({ data }) {
  const properties = data.properties || [];

  return (
    <div
      style={{
        background: '#fff',
        border: '1.5px solid #c4b5fd',
        borderRadius: 8,
        overflow: 'hidden',
        fontSize: 12,
        cursor: data.link ? 'pointer' : 'default',
        boxShadow: data.highlight
          ? '0 0 0 2px #8b5cf6'
          : '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <div
        style={{
          background: '#8b5cf6',
          color: '#fff',
          padding: '8px 12px',
          fontWeight: 600,
          fontSize: 13,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {data.label}
      </div>
      {properties.length > 0 && (
        <div style={{ padding: '4px 0' }}>
          {properties.map((prop, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '2px 12px',
                gap: 8,
              }}
            >
              <span style={{
                color: '#1e293b',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: prop.primaryKey ? 600 : 400,
              }}>
                {prop.primaryKey && <span style={{ color: '#eab308', marginRight: 4 }}>PK</span>}
                {prop.name}
              </span>
              {prop.type && (
                <span style={{ color: '#94a3b8', fontSize: 11, flexShrink: 0 }}>
                  {prop.type}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
    </div>
  );
}
