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

/**
 * Half the canvas. A change is read here and merely located out there, so the panel is a working
 * surface rather than a slot beside the picture — and being a share of the width rather than a
 * pixel count, it stays that on any screen. Published so the canvas knows what it is covering.
 */
export const DETAIL_PANEL_SHARE = 0.5;

// A column beside the canvas rather than over it. Opening it narrows the graph instead of hiding the
// part of it the reader just clicked, which is what the panning and the toolbar offset existed to
// paper over.
const panelStyle = {
  width: `${DETAIL_PANEL_SHARE * 100}%`,
  flexShrink: 0,
  background: '#fff',
  borderLeft: '1px solid #e5e7eb',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

/**
 * One entry when several are selected. The panel itself scrolls, so a stacked body flows rather than
 * claiming the height, and a rule separates it from the next.
 */
/** A body inside the stack flows to its full height; the panel around it is what scrolls. */
const scrollerStyle = (stacked, extra = {}) => (stacked
  ? { display: 'flex', flexDirection: 'column', ...extra }
  : { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', ...extra });

const stackedBodyStyle = {
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  borderBottom: '1px solid #e5e7eb',
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
  change,
  changesOnly,
  graphData,
  isCollapsed,
  onToggleCollapse,
  onCollapseOthers,
  onExpandAll,
  onClose,
  selection,
  stacked,
}) {
  const { t } = useTranslation();
  // Selecting three cards and being shown one is the panel disagreeing with the list about what is
  // selected. Stacked in the list's order, so the reader's eye lands where they last clicked.
  if (!stacked && selection && selection.length > 1) {
    return (
      <div style={{ ...panelStyle, overflow: 'auto' }}>
        {selection.map((item, index) => (
          <DetailPanel
            key={item.key}
            node={item.node}
            change={item.change}
            changesOnly={changesOnly}
            graphData={graphData}
            isCollapsed={isCollapsed}
            onToggleCollapse={onToggleCollapse}
            onCollapseOthers={onCollapseOthers}
            onExpandAll={onExpandAll}
            // One control clearing one selection: an X per entry would read as "remove this one",
            // which is not what it does.
            onClose={index === 0 ? onClose : undefined}
            stacked
          />
        ))}
      </div>
    );
  }
  if (edge) return <EdgePanel edge={edge} graphData={graphData} onClose={onClose} stacked={stacked} />;
  // A change with no node behind it — the namespace's own, which is a card without a place on the
  // canvas. Selecting it showed an empty panel, which read as the click having failed.
  if (!node && change) return <ChangePanel change={change} onClose={onClose} stacked={stacked} />;
  if (!node) return null;

  const type = node.type || 'entity';
  const diff = DIFF_STYLES[node.data.diff];
  // The diff owns the accent when there is one: what a reviewer needs to see first is that this
  // element is part of the proposal, not which kind of concept it is.
  const accentColor = diff ? diff.color : (ACCENT_COLORS[type] || ACCENT_COLORS.entity);
  const { label, description, link } = node.data;
  const isGroup = GROUP_TYPES.has(type);

  return (
    <div style={stacked ? stackedBodyStyle : panelStyle}>
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
          {onClose ? <button onClick={onClose} style={closeButtonStyle} title={t('detail.close')}>✕</button> : null}
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
        <div style={scrollerStyle(stacked)}>
          <DiffSection detail={node.data.diffDetail} />
          {/* The card's, not the node's: selecting a shared property resolves to the concept that
              governs it, so an unguarded render put Customer's relationship changes under Customer
              Email's name. Shown only where the two are the same element. */}
          <RelationshipChangesSection
            relationships={change?.externalId === node.data?.externalId ? change.relationships : null} />
          <EvidenceSection evidence={node.data.evidence} missing={node.data.evidenceMissing} />
          <OverlapSection overlaps={node.data.overlaps} />
          <ConsumersSection consumers={node.data.consumers} />
          <EntityBody node={node} changesOnly={changesOnly} />
        </div>
      )}
    </div>
  );
}

function EdgePanel({ edge, graphData, onClose, stacked }) {
  const { t } = useTranslation();
  // Selection can arrive either as a React Flow edge (clicked in the canvas, diff data nested under
  // `data`) or as a raw graph edge (clicked in the related-changes list, diff data at the top level).
  const detail = edge.data?.diffDetail ?? edge.diffDetail;
  const diff = DIFF_STYLES[edge.data?.diff ?? edge.diff];
  const accentColor = diff ? diff.color : '#64748b';
  const nameOf = (id) => graphData?.nodes?.find((n) => n.id === id)?.data?.label || id;

  return (
    <div style={stacked ? stackedBodyStyle : panelStyle}>
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
          {onClose ? <button onClick={onClose} style={closeButtonStyle} title={t('detail.close')}>✕</button> : null}
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

      <div style={scrollerStyle(stacked)}>
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
/**
 * The detail view for a card with nothing to select in the graph — today the namespace's own change.
 * Reuses [DiffSection] rather than inventing a second way to show a before and after.
 */
function ChangePanel({ change, onClose, stacked }) {
  const { t } = useTranslation();
  const diff = DIFF_STYLES[change.op] || DIFF_STYLES.modify;
  return (
    <div style={stacked ? stackedBodyStyle : panelStyle}>
      <div style={{ height: 4, background: diff.color, flexShrink: 0 }} />
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
              textTransform: 'uppercase', color: '#6b7280',
            }}>
              {change.elementType}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', wordBreak: 'break-word' }}>
              {change.name || change.externalId}
            </div>
          </div>
          {onClose ? <button onClick={onClose} style={closeButtonStyle} aria-label="Close">×</button> : null}
        </div>
      </div>
      <div style={scrollerStyle(stacked)}>
        <DiffSection detail={{ op: change.op, impact: change.impact?.toLowerCase(), fields: change.fields || [] }} />
        <EvidenceSection evidence={change.evidence} missing={!change.evidence || change.evidence.length === 0} />
      </div>
    </div>
  );
}

/**
 * What the proposal does to this concept's relationships.
 *
 * A relationship is a change in its own right and can be the only one a card carries — connecting an
 * existing property to a concept adds no field to either. Nothing rendered them, so such a card read
 * as "Approving this request applies the following" followed by nothing at all.
 */
function RelationshipChangesSection({ relationships }) {
  const { t } = useTranslation();
  if (!relationships || relationships.length === 0) return null;
  const tone = { add: '#15803d', remove: '#b91c1c', modify: '#b45309' };
  return (
    <div>
      <div style={sectionHeaderStyle}>
        {t('detail.relationshipChanges', 'Relationships')} ({relationships.length})
      </div>
      {relationships.map((relationship) => (
        <div key={relationship.externalId} style={{ padding: '8px 16px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
              color: tone[relationship.op] || '#6b7280', flexShrink: 0,
            }}>
              {t('detail.op.' + relationship.op, relationship.op)}
            </span>
            {/* "Customer → marketing_consent_at" rather than the id that encodes it. The stored id is
                machine-made, and reading it is not the reviewer's job. */}
            <span style={{ fontSize: 12.5, color: '#374151', overflowWrap: 'anywhere' }}>
              {relationship.from && relationship.to
                ? `${relationship.from} → ${relationship.to}`
                : relationship.name || relationship.externalId}
            </span>
          </div>
          {relationship.fields?.map((field) => (
            <div key={field.field} style={{ marginTop: 4 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.04em', color: '#6b7280',
              }}>
                {field.field}
              </div>
              <FieldDiff field={field.field} before={field.before} after={field.after} base={field.base} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

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
      <FieldDiff field={change.field} before={change.before} after={change.after} base={change.base} />
    </div>
  );
}


// --- Decorated values ------------------------------------------------------------------------
//
// A host may know things about a value that this component cannot: that "Confidential" is a governed
// level with a colour and an icon of its own, that a tier outranks another. Rather than teach those
// concepts here, any value in a change may arrive as `{ display: 'badge', label, color, icon }` and
// is drawn as one wherever a plain value would have been — a field, a list item, a map entry.
// `color` is a palette token, `icon` inline SVG the host is trusted for, exactly as it is trusted
// for the labels beside it.

const BADGE_PALETTE = {
  red: ['#fef2f2', '#b91c1c', '#fecaca'],
  orange: ['#fff7ed', '#c2410c', '#fed7aa'],
  amber: ['#fffbeb', '#b45309', '#fde68a'],
  yellow: ['#fefce8', '#854d0e', '#fef08a'],
  green: ['#f0fdf4', '#15803d', '#bbf7d0'],
  teal: ['#f0fdfa', '#0f766e', '#99f6e4'],
  blue: ['#eff6ff', '#1d4ed8', '#bfdbfe'],
  indigo: ['#eef2ff', '#4338ca', '#c7d2fe'],
  purple: ['#faf5ff', '#7e22ce', '#e9d5ff'],
  pink: ['#fdf2f8', '#be185d', '#fbcfe8'],
  gray: ['#f9fafb', '#4b5563', '#e5e7eb'],
};

/**
 * A decorated value the host can say more about than its text does. When it carries an `href` it is
 * a way back to the thing itself — the level that says what "Confidential" obliges, the team taking
 * ownership — which is exactly what a reviewer needs and cannot get from the word.
 */
function Decorated({ value, strike }) {
  const linked = Boolean(value.href) && !strike;
  // A badge is already a thing rather than a word, so it keeps its own colours and says it is
  // clickable by being a badge. A plain value has nothing to go on, and hover is no help to someone
  // who does not know there is anything to hover — so the link is underlined standing still.
  const inner = value.display === 'badge' ? <Badge badge={value} strike={strike} /> : (
    <span style={{
      ...chipStyle('same'),
      ...(linked ? { color: '#4338ca', borderColor: '#c7d2fe', background: '#eef2ff' } : {}),
      textDecoration: strike ? 'line-through' : linked ? 'underline' : 'none',
      textUnderlineOffset: 2,
    }}>
      {value.label}
    </span>
  );
  if (!value.href) return inner;
  return (
    <a href={value.href} title={value.label}
       style={{ textDecoration: 'none', display: 'inline-flex', borderRadius: 6 }}
       onMouseOver={(e) => { e.currentTarget.style.opacity = 0.75; }}
       onMouseOut={(e) => { e.currentTarget.style.opacity = 1; }}>
      {inner}
    </a>
  );
}

function Badge({ badge, strike }) {
  const [bg, fg, ring] = BADGE_PALETTE[(badge.color || 'gray').toLowerCase()] || BADGE_PALETTE.gray;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 6,
      padding: '2px 8px', fontSize: 11.5, fontWeight: 500,
      background: bg, color: fg, border: `1px solid ${ring}`,
      marginTop: 3, textDecoration: strike ? 'line-through' : 'none',
    }}>
      {badge.icon ? (
        <span style={{ width: 14, height: 14, display: 'inline-flex' }}
              dangerouslySetInnerHTML={{ __html: badge.icon }} />
      ) : null}
      {badge.label}
    </span>
  );
}

// A translation key names a locale, and a flag is how the application shows one.
const LOCALE_FLAGS = {
  de: '\u{1F1E9}\u{1F1EA}', fr: '\u{1F1EB}\u{1F1F7}', es: '\u{1F1EA}\u{1F1F8}', it: '\u{1F1EE}\u{1F1F9}',
  nl: '\u{1F1F3}\u{1F1F1}', pt: '\u{1F1F5}\u{1F1F9}', pl: '\u{1F1F5}\u{1F1F1}', en: '\u{1F1EC}\u{1F1E7}',
};

/** `description@de` reads as a German description, not as a key with a suffix. */
function TranslationKey({ name }) {
  const at = name.lastIndexOf('@');
  if (at < 0) {
    return (
      <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, color: '#6b7280', marginRight: 12 }}>
        {name}
      </span>
    );
  }
  const field = name.slice(0, at);
  const locale = name.slice(at + 1).toLowerCase();
  return (
    // Room between the parts, not a line break: the flag, the tag and the field name ran together at
    // 10.5px with three pixels between them, which is a spacing problem rather than a width one.
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginRight: 12 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 4,
        border: '1px solid #e5e7eb', background: '#fff', padding: '2px 7px', fontSize: 11, color: '#374151',
      }}>
        <span>{LOCALE_FLAGS[locale] || '\u{1F310}'}</span>
        <span style={{ fontWeight: 600, letterSpacing: '0.04em' }}>{locale.toUpperCase()}</span>
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280' }}>
        {field}
      </span>
    </span>
  );
}

// --- Field rendering, by shape ---------------------------------------------------------------
//
// A change is not always prose. A classification is one value from a small set, `required` is a
// state, `examples` is a set of items, and `custom_properties` holds translations keyed by locale.
// Rendering all of them as before-and-after paragraphs made the small changes hard to see and the
// map of translations unreadable — one struck-through block where the reviewer needed to know which
// locale moved.

// OSI's own small vocabularies: one value out of a handful, which reads better as a chip than as a
// sentence. Governed values are not listed here — those arrive decorated and are recognised by shape.
const ENUM_FIELDS = new Set(['status', 'kind', 'element_type', 'better_when']);
const CODE_FIELDS = new Set(['pattern', 'formula', 'iri', 'data_type', 'extends', 'unit']);

const isBlank = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const isList = (v) => Array.isArray(v);
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !v.display;
const isBool = (v) => typeof v === 'boolean';
const isDecorated = (v) => v !== null && typeof v === 'object' && typeof v.display === 'string';

const chipStyle = (kind) => ({
  display: 'inline-block',
  fontSize: 11.5,
  padding: '1px 7px',
  borderRadius: 4,
  border: '1px solid',
  marginRight: 4,
  marginTop: 3,
  ...(kind === 'add'
    ? { color: '#15803d', borderColor: '#bbf7d0', background: '#f0fdf4' }
    : kind === 'remove'
      ? { color: '#b91c1c', borderColor: '#fecaca', background: '#fef2f2', textDecoration: 'line-through' }
      : { color: '#374151', borderColor: '#e5e7eb', background: '#f9fafb' }),
});

/** One value as a chip, so a small vocabulary reads as a value rather than a sentence. */
function Chip({ value, kind, mono }) {
  const { t } = useTranslation();
  if (isDecorated(value)) return <Decorated value={value} strike={kind === 'remove'} />;
  if (isBlank(value)) {
    return <span style={{ ...chipStyle('same'), color: '#9ca3af', fontStyle: 'italic' }}>{t('detail.diff.unset')}</span>;
  }
  return (
    <span style={{
      ...chipStyle(kind),
      // A pattern or formula can outrun the panel; it breaks inside its own border rather than past it.
      ...(mono ? { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', maxWidth: '100%', overflowWrap: 'anywhere' } : {}),
    }}>
      {String(value)}
    </span>
  );
}

/** Old and new side by side. For one-of-a-few values, the arrow says more than two labelled rows. */
function ChipTransition({ before, after, mono }) {
  return (
    <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      <Chip value={before} kind="remove" mono={mono} />
      {/* The arrow travels with the value it points at. A long value wrapping to the next line
          otherwise strands the arrow at the end of the previous one, and the pair stops reading
          as one transition. */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, maxWidth: '100%' }}>
        <span style={{ color: '#9ca3af', fontSize: 12 }}>→</span>
        <Chip value={after} kind="add" mono={mono} />
      </span>
    </div>
  );
}

/** A set difference: what stayed, what went, what arrived — rather than two printed lists. */
function ListDiff({ before, after }) {
  const key = (v) => (isDecorated(v) ? `d:${v.display}:${v.label}` : String(v));
  const b = (before || []).map(key);
  const a = (after || []).map(key);
  const byKey = new Map([...(before || []), ...(after || [])].map((v) => [key(v), v]));
  const chip = (k, kind) => <Chip key={kind + k} value={byKey.get(k)} kind={kind} />;
  const removed = b.filter((x) => !a.includes(x));
  const added = a.filter((x) => !b.includes(x));
  const kept = a.filter((x) => b.includes(x));
  return (
    <div style={{ marginTop: 3 }}>
      {kept.map((k) => chip(k, 'same'))}
      {removed.map((k) => chip(k, 'remove'))}
      {added.map((k) => chip(k, 'add'))}
    </div>
  );
}

/**
 * A map, key by key. Translations live here, and a reviewer's question is which locale changed —
 * not what the whole map used to print as.
 */
function MapDiff({ before, after }) {
  const b = isMap(before) ? before : {};
  const a = isMap(after) ? after : {};
  // `evidence` rides in custom_properties but has a section of its own above; showing the raw
  // entry here would print the same citation twice, once unreadably.
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => k !== 'evidence').sort();
  const moved = keys.filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
  if (moved.length === 0) return null;
  return (
    <div style={{ marginTop: 3 }}>
      {moved.map((k) => (
        <div key={k} style={{ marginTop: 10 }}>
          <TranslationKey name={k} />
          {isBlank(b[k])
            ? <Chip value={a[k]} kind="add" />
            : isBlank(a[k])
              ? <Chip value={b[k]} kind="remove" />
              : isDecorated(b[k]) || isDecorated(a[k])
                ? <ChipTransition before={b[k]} after={a[k]} />
                : <ProseDiff before={b[k]} after={a[k]} />}
        </div>
      ))}
    </div>
  );
}

/** The original treatment, kept for what it suits: sentences. */
function ProseDiff({ before, after, base }) {
  const { t } = useTranslation();
  // Two sentences one above the other, each wrapped to four lines, are compared by memory. Side by
  // side at the same width, the words that moved are the ones that do not line up. `auto-fit` drops
  // back to one column where two would be too narrow to read, without anything measuring anything.
  return (
    <div style={{
      display: 'grid',
      // Sized so a three-way comparison still fits on one row; auto-fit collapses the spare track
      // back into two halves when there is no base to show.
      gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
      gap: 10,
      marginTop: 3,
    }}>
      {/* The version the author wrote against, shown only where the target has moved away from it.
          Without it a conflict reads as an ordinary change that was refused for no reason. */}
      {base !== undefined && base !== null && (
        <ProseColumn label={t('detail.diff.base', 'Was')} value={base} color="#6b7280" />
      )}
      <ProseColumn label={t('detail.diff.before')} value={before} color="#dc2626" strike />
      <ProseColumn label={t('detail.diff.after')} value={after} color="#16a34a" />
    </div>
  );
}

function ProseColumn({ label, value, color, strike }) {
  const { t } = useTranslation();
  const isUnset = value === null || value === undefined || value === '';
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
        color, marginBottom: 3,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 12.5, lineHeight: 1.5, color: isUnset ? '#9ca3af' : '#374151',
        fontStyle: isUnset ? 'italic' : 'normal',
        textDecoration: !isUnset && strike ? 'line-through' : 'none',
        overflowWrap: 'anywhere',
      }}>
        {isUnset ? t('detail.diff.unset') : String(value)}
      </div>
    </div>
  );
}

/** Picks the rendering from the value's shape, falling back to prose. */
function FieldDiff({ field, before, after, base }) {
  // A three-way situation is a diff of prose whatever the field's shape: the point is the third
  // value, and chips side by side cannot say which of them the author never saw.
  const threeWay = base !== undefined && base !== null;
  if (!threeWay) {
    if (isDecorated(before) || isDecorated(after)) return <ChipTransition before={before} after={after} />;
    if (isMap(before) || isMap(after)) return <MapDiff before={before} after={after} />;
    if (isList(before) || isList(after)) return <ListDiff before={before} after={after} />;
    if (isBool(before) || isBool(after)) return <ChipTransition before={before} after={after} />;
    if (ENUM_FIELDS.has(field)) return <ChipTransition before={before} after={after} />;
  }
  if (!threeWay && CODE_FIELDS.has(field)) return <ChipTransition before={before} after={after} mono />;
  return <ProseDiff before={before} after={after} base={base} />;
}

function EntityBody({ node, changesOnly }) {
  const { t } = useTranslation();
  const { description, properties = [] } = node.data;
  const ownProperties = properties.filter((p) => !p.inherited);
  const inheritedProperties = properties.filter((p) => p.inherited);

  return (
    <div>
      {ownProperties.length > 0 && (
        <PropertySection title={t('detail.properties')} properties={ownProperties}
                         count={ownProperties.length} changesOnly={changesOnly} />
      )}
      {inheritedProperties.length > 0 && (
        <PropertySection title={t('detail.inherited')} properties={inheritedProperties}
                         count={inheritedProperties.length} inherited changesOnly={changesOnly} />
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

function PropertySection({ title, properties, count, inherited, changesOnly }) {
  const { t } = useTranslation();
  const changed = properties.filter((p) => p.diff);
  const shown = changesOnly ? changed : properties;
  if (shown.length === 0) return null;
  return (
    <div>
      {/* The total and how much of it moved: with fourteen properties and one change, the count is
          what tells a reviewer whether they are looking at a rewrite or a typo. */}
      <div style={sectionHeaderStyle}>
        {title} ({count}{changed.length > 0 ? t('detail.propertiesChanged', { count: changed.length }) : ''})
      </div>
      {shown.map((prop, i) => (
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
            {/* A shared property is carried by several concepts, so a change to it reaches all of
                them — which is exactly what a reviewer looking at one concept cannot otherwise see. */}
            {prop.shared && (
              <span style={{
                fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                color: '#6366f1', border: '1px solid #c7d2fe', borderRadius: 3, padding: '0 4px',
              }}>
                {t('detail.shared', 'shared')}
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
        {prop.description && (
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, lineHeight: 1.4 }}>
            {prop.description}
          </div>
        )}
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
                <FieldDiff field={f.field} before={f.before} after={f.after} base={f.base} />
              </div>
            ))}
          </div>
        )}
        </div>
      ))}
    </div>
  );
}
