import React from 'react';
import { useTranslation } from 'react-i18next';
import { DIFF_STYLES } from './diffStyles';

// Impact is a separate channel from the diff op: how consequential a change is, independent of
// whether it adds, changes or removes. Ordered as the review order in the change request list.
const IMPACT_COLORS = {
  structural: '#dc2626',  // red-600
  descriptive: '#d97706', // amber-600
  cosmetic: '#64748b',    // slate-500
};

const panelStyle = {
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
};

const closeButtonStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
  color: '#9ca3af',
  fontSize: 18,
  lineHeight: 1,
  flexShrink: 0,
  marginLeft: 8,
};

const sectionHeaderStyle = {
  padding: '10px 16px 6px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#9ca3af',
  background: '#f9fafb',
  borderBottom: '1px solid #e5e7eb',
};

const endpointStyle = {
  padding: '2px 7px',
  borderRadius: 4,
  background: '#f1f5f9',
  border: '1px solid #e2e8f0',
  fontWeight: 600,
};

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
  edge,
  graphData,
  isCollapsed,
  onToggleCollapse,
  onCollapseOthers,
  onExpandAll,
  onSelectEdge,
  onClose,
}) {
  const { t } = useTranslation();
  if (edge) return <EdgePanel edge={edge} graphData={graphData} onClose={onClose} />;
  if (!node) return null;

  const type = node.type || 'entity';
  const diff = DIFF_STYLES[node.data.diff];
  // The diff owns the accent when there is one: what a reviewer needs to see first is that this
  // element is part of the proposal, not which kind of concept it is.
  const accentColor = diff ? diff.color : (ACCENT_COLORS[type] || ACCENT_COLORS.entity);
  const { label, description, link } = node.data;
  const isGroup = GROUP_TYPES.has(type);

  return (
    <div style={panelStyle}>
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
          <button onClick={onClose} style={closeButtonStyle} title={t('detail.close')}>✕</button>
        </div>

        {/* Stated, not just chipped: a concept borrowed from another namespace is not this
            namespace's to change, and that has to be unmissable before anyone reviews it. */}
        {node.data.unresolved && (
          <div style={{
            marginTop: 8,
            padding: '8px 11px',
            borderRadius: 6,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            fontSize: 12.5,
            color: '#b91c1c',
            lineHeight: 1.5,
          }}>
            {t('detail.unresolved')}
            {node.data.removedBy && (
              <div style={{ marginTop: 6 }}>
                <a
                  href={node.data.removedBy.link}
                  style={{ color: '#b91c1c', fontWeight: 700, textDecoration: 'underline' }}
                >
                  {t('detail.unresolvedRemovedBy')}
                </a>
              </div>
            )}
          </div>
        )}

        {node.data.externalNamespace && (
          <div style={{
            marginTop: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 9px',
            borderRadius: 999,
            background: '#f1f5f9',
            border: '1px dashed #cbd5e1',
            fontSize: 12,
            fontWeight: 600,
            color: '#475569',
          }}>
            ↗ {t('detail.externalNamespace', { namespace: node.data.externalNamespace })}
          </div>
        )}

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
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <DiffSection detail={node.data.diffDetail} />
          <EvidenceSection evidence={node.data.evidence} missing={node.data.evidenceMissing} />
          <OverlapSection overlaps={node.data.overlaps} />
          <ConsumersSection consumers={node.data.consumers} />
          <RelatedChangesSection node={node} graphData={graphData} onSelectEdge={onSelectEdge} />
          <EntityBody node={node} />
        </div>
      )}
    </div>
  );
}

function EdgePanel({ edge, graphData, onClose }) {
  const { t } = useTranslation();
  // Selection can arrive either as a React Flow edge (clicked in the canvas, diff data nested under
  // `data`) or as a raw graph edge (clicked in the related-changes list, diff data at the top level).
  const detail = edge.data?.diffDetail ?? edge.diffDetail;
  const diff = DIFF_STYLES[edge.data?.diff ?? edge.diff];
  const accentColor = diff ? diff.color : '#64748b';
  const nameOf = (id) => graphData?.nodes?.find((n) => n.id === id)?.data?.label || id;

  return (
    <div style={panelStyle}>
      <div style={{ height: 4, background: accentColor, flexShrink: 0 }} />
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
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
              {t('detail.type.relationship')}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', wordBreak: 'break-word' }}>
              {edge.data?.label || edge.label}
            </div>
          </div>
          <button onClick={onClose} style={closeButtonStyle} title={t('detail.close')}>✕</button>
        </div>

        {/* The two ends are what a relationship is; naming them saves tracing the line back. */}
        <div style={{
          marginTop: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
          fontSize: 12,
          color: '#374151',
        }}>
          <span style={endpointStyle}>{nameOf(edge.source)}</span>
          <span style={{ color: '#9ca3af' }}>→</span>
          <span style={endpointStyle}>{nameOf(edge.target)}</span>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <DiffSection detail={detail} />
        <EvidenceSection evidence={edge.data?.evidence ?? edge.evidence}
                         missing={edge.data?.evidenceMissing ?? edge.evidenceMissing} />
      </div>
    </div>
  );
}

/**
 * What the proposal cites for this element.
 *
 * A reviewer cannot verify forty generated concepts from knowledge. What they can do is read the
 * quote and judge whether it says what the concept says — so the quote belongs on the element, not
 * in a document somewhere else. An element changed with nothing cited is called out: absence of
 * evidence is the thing worth noticing, and it is invisible unless stated.
 */
function EvidenceSection({ evidence, missing }) {
  const { t } = useTranslation();
  const items = evidence || [];
  if (items.length === 0 && !missing) return null;

  if (items.length === 0) {
    return (
      <div style={{ borderBottom: '1px solid #e5e7eb', background: '#fffbeb' }}>
        <div style={{ ...sectionHeaderStyle, background: 'transparent', borderBottom: 'none', color: '#92400e' }}>
          {t('detail.evidence.heading')}
        </div>
        <div style={{ padding: '0 16px 12px', fontSize: 12.5, color: '#78350f', lineHeight: 1.5 }}>
          {t('detail.evidence.none')}
        </div>
      </div>
    );
  }

  return (
    <div style={{ borderBottom: '1px solid #e5e7eb' }}>
      <div style={sectionHeaderStyle}>
        {t('detail.evidence.heading')} ({items.length})
      </div>
      <div style={{ padding: '10px 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((e, i) => (
          <div key={i}>
            <blockquote style={{
              margin: 0,
              padding: '6px 0 6px 10px',
              borderLeft: '3px solid #cbd5e1',
              fontSize: 12.5,
              lineHeight: 1.5,
              color: '#334155',
              fontStyle: 'italic',
            }}>
              {e.quote}
            </blockquote>
            {e.label && (
              <div style={{ marginTop: 3, fontSize: 11.5, color: e.resolvable === false ? '#b45309' : '#64748b' }}>
                {e.label}
              </div>
            )}
            {e.resolvable === false && (
              <div style={{ marginTop: 2, fontSize: 11.5, color: '#b45309' }}>
                {t('detail.evidence.unresolvable')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Other pending change requests editing this same element.
 *
 * Overlap is a risk, not a certainty: approving reshapes the others onto the new state and two edits
 * to one concept often merge cleanly. What the reviewer needs is which concept is contested and a way
 * to go and look, which is why this hangs off the element rather than sitting in a banner.
 */
function OverlapSection({ overlaps }) {
  const { t } = useTranslation();
  if (!overlaps || overlaps.length === 0) return null;

  return (
    <div style={{ borderBottom: '1px solid #e5e7eb', background: '#eef2ff' }}>
      <div style={{ ...sectionHeaderStyle, background: 'transparent', borderBottom: 'none', color: '#4338ca' }}>
        {t('detail.overlap.heading')} ({overlaps.length})
      </div>
      <div style={{ padding: '0 16px 12px', fontSize: 12.5, color: '#3730a3', lineHeight: 1.5 }}>
        {t('detail.overlap.description')}
      </div>
      <div style={{ padding: '0 16px 12px' }}>
        {overlaps.map((o) => (
          <div key={o.changeRequestExternalId} style={{ fontSize: 13, marginTop: 2 }}>
            <a href={o.link} style={{ color: '#4338ca', fontWeight: 600, textDecoration: 'none' }}
               onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
               onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}>
              {t('detail.overlap.view')}
            </a>
            {o.teamName && <span style={{ color: '#4f46e5' }}> · {o.teamName}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * What breaks if this removal goes ahead — the consumers that do not get a vote on it.
 *
 * Deliberately here rather than in a table beside the graph: the removal and its cost are one fact,
 * and separating them makes the reviewer join them up by hand. Approving is decided on this.
 */
function ConsumersSection({ consumers }) {
  const { t } = useTranslation();
  if (!consumers || consumers.total === 0) return null;

  const groups = [
    ['relationship', consumers.relationships],
    ['dataProduct', consumers.dataProducts],
    ['dataContract', consumers.dataContracts],
  ].filter(([, items]) => items && items.length > 0);

  return (
    <div style={{ borderBottom: '1px solid #e5e7eb', background: '#fffbeb' }}>
      <div style={{ ...sectionHeaderStyle, background: 'transparent', borderBottom: 'none', color: '#92400e' }}>
        {t('detail.consumers.heading')} ({consumers.total})
      </div>
      <div style={{ padding: '0 16px 12px', fontSize: 12.5, color: '#78350f', lineHeight: 1.5 }}>
        {t('detail.consumers.description')}
      </div>
      {groups.map(([kind, items]) => (
        <div key={kind} style={{ padding: '0 16px 10px' }}>
          <div style={{
            fontSize: 10.5,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: '#b45309',
            marginBottom: 4,
          }}>
            {t(`detail.consumers.${kind}`)}
          </div>
          {items.map((item, i) => (
            <div key={i} style={{ fontSize: 13, marginTop: 2 }}>
              {item.link ? (
                <a href={item.link} style={{ color: '#92400e', fontWeight: 600, textDecoration: 'none' }}
                   onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                   onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}>
                  {item.label}
                </a>
              ) : (
                <span style={{ color: '#92400e', fontWeight: 600 }}>{item.label}</span>
              )}
              {item.namespace && (
                <span style={{ color: '#b45309', fontWeight: 400 }}> · {item.namespace}</span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The changed relationships hanging off an otherwise untouched concept.
 *
 * Without this a reviewer hits a dead end: the concept is drawn as involved — it survives the
 * changes-only filter, it sits at the end of a coloured edge — but its own panel has nothing to do
 * with the request, which reads as a bug rather than as "the change is on the line, not the box".
 */
function RelatedChangesSection({ node, graphData, onSelectEdge }) {
  const { t } = useTranslation();
  const related = (graphData?.edges || []).filter(
    (e) => e.diff && (e.source === node.id || e.target === node.id),
  );
  if (related.length === 0) return null;

  const nameOf = (id) => graphData?.nodes?.find((n) => n.id === id)?.data?.label || id;

  return (
    <div>
      <div style={sectionHeaderStyle}>
        {t('detail.diff.related')} ({related.length})
      </div>
      {related.map((e) => {
        const diff = DIFF_STYLES[e.diff] || DIFF_STYLES.modify;
        const isOutgoing = e.source === node.id;
        const other = nameOf(isOutgoing ? e.target : e.source);
        return (
          <div
            key={e.id}
            onClick={onSelectEdge ? () => onSelectEdge(e) : undefined}
            style={{
              padding: '8px 16px',
              borderBottom: '1px solid #f3f4f6',
              cursor: onSelectEdge ? 'pointer' : 'default',
            }}
            onMouseOver={(ev) => { ev.currentTarget.style.background = '#f9fafb'; }}
            onMouseOut={(ev) => { ev.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                flexShrink: 0,
                width: 15,
                height: 15,
                borderRadius: '50%',
                background: diff.color,
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {diff.symbol}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{e.label}</span>
            </div>
            {/* Direction matters: "consumes Input Port" and "consumed by Data Product" are different facts. */}
            <div style={{ marginTop: 3, marginLeft: 21, fontSize: 12, color: '#6b7280' }}>
              {isOutgoing ? '→ ' : '← '}{other}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * What the change request proposes for the selected element, field by field.
 *
 * Deliberately not the YAML hunk: the reviewer is already looking at the model as a graph, and a
 * patch would make them re-parse it as text to answer "what changed about this one thing".
 */
function DiffSection({ detail }) {
  const { t } = useTranslation();
  if (!detail) return null;

  const diff = DIFF_STYLES[detail.op] || DIFF_STYLES.modify;
  const impactColor = IMPACT_COLORS[detail.impact] || IMPACT_COLORS.cosmetic;

  return (
    <div style={{ borderBottom: '1px solid #e5e7eb', background: `${diff.color}08` }}>
      <div style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 9px',
            borderRadius: 999,
            background: diff.color,
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.02em',
          }}>
            <span style={{ fontSize: 12, lineHeight: 1 }}>{diff.symbol}</span>
            {t(`detail.diff.op.${detail.op}`)}
          </span>
          <span
            style={{
              padding: '3px 9px',
              borderRadius: 999,
              border: `1px solid ${impactColor}`,
              color: impactColor,
              fontSize: 11,
              fontWeight: 600,
            }}
            title={t(`detail.diff.impactHint.${detail.impact}`)}
          >
            {t(`detail.diff.impact.${detail.impact}`)}
          </span>
        </div>

        <div style={{ marginTop: 8, fontSize: 12.5, color: '#4b5563', lineHeight: 1.5 }}>
          {t(`detail.diff.summary.${detail.op}`)}
        </div>
      </div>

      {detail.fields?.length > 0 && (
        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {detail.fields.map((f) => (
            <FieldChange key={f.field} change={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldChange({ change }) {
  const { t } = useTranslation();
  const impactColor = IMPACT_COLORS[change.impact] || IMPACT_COLORS.cosmetic;

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderLeft: `3px solid ${impactColor}`,
      borderRadius: 5,
      padding: '9px 11px',
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: '#6b7280',
        marginBottom: 7,
      }}>
        {change.field}
      </div>
      <ValueRow label={t('detail.diff.before')} value={change.before} color="#dc2626" strike />
      <ValueRow label={t('detail.diff.after')} value={change.after} color="#16a34a" />
    </div>
  );
}

function ValueRow({ label, value, color, strike }) {
  const { t } = useTranslation();
  const isUnset = value === null || value === undefined || value === '';

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 2 }}>
      <span style={{
        flexShrink: 0,
        width: 62,
        fontSize: 10.5,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        color,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 12.5,
        lineHeight: 1.45,
        color: isUnset ? '#9ca3af' : '#111827',
        fontStyle: isUnset ? 'italic' : 'normal',
        textDecoration: strike && !isUnset ? 'line-through' : 'none',
        textDecorationColor: '#fca5a5',
        wordBreak: 'break-word',
      }}>
        {isUnset ? t('detail.diff.unset') : value}
      </span>
    </div>
  );
}

function EntityBody({ node }) {
  const { t } = useTranslation();
  const { description, properties = [] } = node.data;
  const ownProperties = properties.filter((p) => !p.inherited);
  const inheritedProperties = properties.filter((p) => p.inherited);

  return (
    <div>
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
  const { t } = useTranslation();
  return (
    <div>
      <div style={sectionHeaderStyle}>
        {title} ({count})
      </div>
      {properties.map((prop, i) => (
        <div
          key={i}
          style={{
            padding: '7px 16px',
            borderBottom: '1px solid #f3f4f6',
            background: prop.diff ? `${DIFF_STYLES[prop.diff]?.color ?? '#94a3b8'}08` : 'transparent',
          }}
        >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 13,
            fontWeight: prop.diff ? 700 : 500,
            color: prop.diff ? (DIFF_STYLES[prop.diff]?.color ?? '#374151') : (inherited ? '#9ca3af' : '#374151'),
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
            {prop.diff && (
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                color: DIFF_STYLES[prop.diff]?.color ?? '#374151',
              }}>
                {DIFF_STYLES[prop.diff]?.label}
              </span>
            )}
          </div>
        </div>
        {/* The property is what changed, so its before and after belong on its row — not one level
            up on the concept, which did not change. */}
        {prop.diffDetail?.fields?.length > 0 && (
          <div style={{ marginTop: 5 }}>
            {prop.diffDetail.fields.map((f) => (
              <div key={f.field} style={{ marginTop: 3 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.04em', color: '#6b7280',
                }}>
                  {f.field}
                </div>
                <ValueRow label={t('detail.diff.before')} value={f.before} color="#dc2626" strike />
                <ValueRow label={t('detail.diff.after')} value={f.after} color="#16a34a" />
              </div>
            ))}
          </div>
        )}
        </div>
      ))}
    </div>
  );
}
