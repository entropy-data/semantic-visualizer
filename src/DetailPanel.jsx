import React from 'react';
import { useTranslation } from 'react-i18next';

const ACCENT_COLORS = {
  entity: '#3b82f6',
  property: '#22c55e',
  shared_property: '#22c55e',
  metric: '#8b5cf6',
  group: '#f97316',           // orange-500
  collapsed_group: '#f97316',
};

// Maps node type -> i18n key; resolved with t() at the usage site.
const TYPE_LABELS = {
  entity: 'detail.type.entity',
  property: 'detail.type.property',
  shared_property: 'detail.type.property',
  metric: 'detail.type.metric',
  group: 'detail.type.group',
  collapsed_group: 'detail.type.group',
};

const GROUP_TYPES = new Set(['group', 'collapsed_group']);

const TYPE_ICON_COLOR = {
  entity: '#60a5fa',
  metric: '#c084fc',
  property: '#4ade80',
  shared_property: '#4ade80',
};

const TYPE_ICON = {
  entity: (
    <svg width="12" height="12" viewBox="0 0 20 20" fill={TYPE_ICON_COLOR.entity}>
      <path d="M10.362 1.093a.75.75 0 0 0-.724 0L2.523 5.018 10 9.143l7.477-4.125-7.115-3.925ZM18 6.443l-7.25 4v8.25l6.888-3.8A.75.75 0 0 0 18 14.25V6.443ZM9.25 18.693v-8.25l-7.25-4v7.807a.75.75 0 0 0 .362.643l6.888 3.8Z"/>
    </svg>
  ),
  metric: (
    <svg width="12" height="12" viewBox="0 0 20 20" fill={TYPE_ICON_COLOR.metric}>
      <path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-1ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9A1.5 1.5 0 0 0 9.5 18h1a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 10.5 6h-1ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5A1.5 1.5 0 0 0 3.5 18h1A1.5 1.5 0 0 0 6 16.5v-5A1.5 1.5 0 0 0 4.5 10h-1Z"/>
    </svg>
  ),
  property: (
    <svg width="12" height="12" viewBox="0 0 20 20" fill={TYPE_ICON_COLOR.property}>
      <path fillRule="evenodd" d="M4.5 2A2.5 2.5 0 0 0 2 4.5v3.879a2.5 2.5 0 0 0 .732 1.767l7.5 7.5a2.5 2.5 0 0 0 3.536 0l3.878-3.878a2.5 2.5 0 0 0 0-3.536l-7.5-7.5A2.5 2.5 0 0 0 8.38 2H4.5ZM5 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/>
    </svg>
  ),
  shared_property: (
    <svg width="12" height="12" viewBox="0 0 20 20" fill={TYPE_ICON_COLOR.shared_property}>
      <path fillRule="evenodd" d="M4.5 2A2.5 2.5 0 0 0 2 4.5v3.879a2.5 2.5 0 0 0 .732 1.767l7.5 7.5a2.5 2.5 0 0 0 3.536 0l3.878-3.878a2.5 2.5 0 0 0 0-3.536l-7.5-7.5A2.5 2.5 0 0 0 8.38 2H4.5ZM5 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/>
    </svg>
  ),
  group: (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#64748b" strokeWidth="2">
      <rect x="2.5" y="3.5" width="15" height="5" rx="1" />
      <rect x="2.5" y="11.5" width="15" height="5" rx="1" />
    </svg>
  ),
};

const KeyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
  </svg>
);

export default function DetailPanel({
  node,
  graphData,
  isCollapsed,
  onToggleCollapse,
  onCollapseOthers,
  onExpandAll,
  onClose,
}) {
  const { t } = useTranslation();
  if (!node) return null;

  const type = node.type || 'entity';
  const accentColor = ACCENT_COLORS[type] || ACCENT_COLORS.entity;
  const { label, description, link } = node.data;
  const isGroup = GROUP_TYPES.has(type);

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
              {t(TYPE_LABELS[type] || 'detail.type.entity')}
            </div>
            {link ? (
              <a
                href={link}
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#111827',
                  wordBreak: 'break-word',
                  textDecoration: 'none',
                  display: 'block',
                }}
                onMouseOver={(e) => e.currentTarget.style.color = accentColor}
                onMouseOut={(e) => e.currentTarget.style.color = '#111827'}
              >
                {label}
              </a>
            ) : (
              <div style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#111827',
                wordBreak: 'break-word',
              }}>
                {label}
              </div>
            )}
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
            title={t('detail.close')}
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
            {t('detail.openDetails')}
          </a>
        )}
      </div>

      {isGroup ? (
        <GroupBody
          node={node}
          graphData={graphData}
          isCollapsed={isCollapsed}
          onToggleCollapse={onToggleCollapse}
          onCollapseOthers={onCollapseOthers}
          onExpandAll={onExpandAll}
        />
      ) : (
        <EntityBody node={node} />
      )}
    </div>
  );
}

function EntityBody({ node }) {
  const { t } = useTranslation();
  const { description, properties = [] } = node.data;
  const ownProperties = properties.filter((p) => !p.inherited);
  const inheritedProperties = properties.filter((p) => p.inherited);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
      {ownProperties.length > 0 && (
        <PropertySection title={t('detail.properties')} properties={ownProperties} count={ownProperties.length} />
      )}
      {inheritedProperties.length > 0 && (
        <PropertySection title={t('detail.inherited')} properties={inheritedProperties} count={inheritedProperties.length} inherited />
      )}
      {properties.length === 0 && !description && (
        <div style={{ padding: 16, fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
          {t('detail.noProperties')}
        </div>
      )}
    </div>
  );
}

function GroupBody({ node, graphData, isCollapsed, onToggleCollapse, onCollapseOthers, onExpandAll }) {
  const { t } = useTranslation();
  // Collect direct and nested members.
  const directMembers = (graphData?.nodes || []).filter((n) => n.parentId === node.id);
  const nestedGroups = directMembers.filter((n) => n.type === 'group');

  // Recursive deep member count (excludes nested groups themselves).
  const deepMemberCount = (() => {
    const nodesById = new Map((graphData?.nodes || []).map((n) => [n.id, n]));
    const childrenByParent = new Map();
    (graphData?.nodes || []).forEach((n) => {
      if (!n.parentId) return;
      if (!childrenByParent.has(n.parentId)) childrenByParent.set(n.parentId, []);
      childrenByParent.get(n.parentId).push(n);
    });
    let count = 0;
    const stack = [node.id];
    while (stack.length) {
      const id = stack.pop();
      (childrenByParent.get(id) || []).forEach((c) => {
        stack.push(c.id);
        if (c.type !== 'group') count++;
      });
    }
    return count;
  })();

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
      {/* Actions */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6, borderBottom: '1px solid #e5e7eb' }}>
        <ActionButton
          onClick={() => onToggleCollapse?.(node.id)}
          label={isCollapsed ? t('detail.expandThisGroup') : t('detail.collapseThisGroup')}
          accent="#4f46e5"
        />
        <ActionButton
          onClick={() => onCollapseOthers?.(node.id)}
          label="Collapse other groups at this level"
        />
        <ActionButton
          onClick={() => onExpandAll?.()}
          label="Expand all groups"
        />
      </div>

      {/* Members summary */}
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
        {t('detail.members', { count: directMembers.length })}{deepMemberCount !== directMembers.length ? t('detail.membersTotal', { total: deepMemberCount }) : ''}
      </div>

      {directMembers.length === 0 ? (
        <div style={{ padding: 16, fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
          {t('detail.noMembers')}
        </div>
      ) : (
        directMembers.map((m) => <MemberRow key={m.id} member={m} />)
      )}
    </div>
  );
}

function ActionButton({ onClick, label, accent }) {
  const color = accent || '#374151';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: '7px 10px',
        border: '1px solid #e5e7eb',
        borderRadius: 6,
        background: '#fff',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 500,
        color,
        transition: 'background 0.12s, border-color 0.12s',
      }}
      onMouseOver={(e) => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
      onMouseOut={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
    >
      {label}
    </button>
  );
}

function MemberRow({ member }) {
  const { t } = useTranslation();
  const type = member.type || 'entity';
  const typeLabel = t(TYPE_LABELS[type] || 'detail.type.entity');
  const icon = TYPE_ICON[type] || TYPE_ICON.entity;
  const { label, link } = member.data || {};

  const row = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 16px',
        borderBottom: '1px solid #f3f4f6',
        fontSize: 13,
        color: '#374151',
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex' }}>{icon}</span>
      <span style={{
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {label || member.id}
      </span>
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: '#9ca3af',
        flexShrink: 0,
      }}>
        {typeLabel}
      </span>
    </div>
  );

  if (link) {
    return (
      <a
        href={link}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
        onMouseOver={(e) => e.currentTarget.style.background = '#f9fafb'}
        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
      >
        {row}
      </a>
    );
  }
  return row;
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
