import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DIFF_STYLES } from './diffStyles';

/**
 * The list a reviewer works through, mirroring [DetailPanel] on the opposite edge — same 4px accent
 * bar, same borders and type scale, so the two read as one surface rather than two.
 *
 * One entry per changed concept. An inline property and a relationship are not entries of their own:
 * they are reviewed as part of the concept they hang off and summarised inside its entry. A shared
 * property does get one, because its change lands on every concept carrying it and telling a reviewer
 * they are changing a single concept would be untrue.
 *
 * Selection is shared with the graph rather than owned here — that is what makes the canvas an
 * instrument, since it is where six changes can be seen to be one coherent subgraph.
 */

const panelStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  bottom: 0,
  width: 300,
  background: '#fff',
  borderRight: '1px solid #e5e7eb',
  boxShadow: '4px 0 12px rgba(0,0,0,0.08)',
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const eyebrowStyle = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: '#6b7280',
};

export default function ReviewPanel({ changes, selectedIds, onSelectionChange, onFocus, onDecide }) {
  const { t } = useTranslation();

  const decidable = useMemo(
    () => new Set(changes.filter((c) => c.decidable !== false && !c.decision).map((c) => c.externalId)),
    [changes],
  );
  const selectedDecidable = useMemo(
    () => [...selectedIds].filter((id) => decidable.has(id)),
    [selectedIds, decidable],
  );

  if (!changes || changes.length === 0) return null;

  const toggle = (externalId, additive) => {
    const next = new Set(additive ? selectedIds : []);
    if (selectedIds.has(externalId) && additive) next.delete(externalId);
    else next.add(externalId);
    onSelectionChange(next);
  };

  return (
    <div style={panelStyle} data-testid="review-panel">
      <div style={{ height: 4, background: '#6366f1', flexShrink: 0 }} />

      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
        <div style={eyebrowStyle}>{t('review.eyebrow', 'Proposal')}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginTop: 2 }}>
          {t('review.pending', '{{count}} to review', { count: decidable.size })}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {changes.map((change) => {
          const diff = DIFF_STYLES[change.op] || DIFF_STYLES.modify;
          const isSelected = selectedIds.has(change.externalId);
          const isDecided = Boolean(change.decision);
          return (
            <div
              key={change.externalId || '__namespace__'}
              data-testid="review-card"
              data-external-id={change.externalId}
              onClick={(e) => {
                toggle(change.externalId, e.metaKey || e.ctrlKey || e.shiftKey);
                onFocus?.(change.externalId);
              }}
              style={{
                border: `1px solid ${isSelected ? '#6366f1' : '#e5e7eb'}`,
                boxShadow: isSelected ? '0 0 0 1px #6366f1' : 'none',
                borderRadius: 6,
                padding: '8px 10px',
                marginBottom: 6,
                cursor: 'pointer',
                opacity: isDecided ? 0.55 : change.decidable === false ? 0.75 : 1,
                background: change.decidable === false && !isDecided ? '#fafafa' : '#fff',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 16,
                    height: 16,
                    border: `1px solid ${diff.color}`,
                    borderRadius: 4,
                    color: diff.color,
                    fontSize: 11,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  {diff.symbol}
                </span>
                <span style={{ fontWeight: 600, color: '#111827', flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                  {change.name || change.externalId}
                </span>
                <span style={{ ...eyebrowStyle, fontSize: 10 }}>{change.elementType}</span>
              </div>

              {/* Why a card will not respond, said on the card. Excluding it from the count is not an
                  explanation, and a reviewer clicking Accept on someone else's element deserves to
                  know before rather than after. */}
              {change.owningTeam ? (
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  {change.owningTeam}
                  {change.decidable === false && !change.decision ? (
                    <span style={{ color: '#9ca3af' }}>
                      {' · '}
                      {t('review.notYours', "{{team}}'s to decide", { team: change.owningTeam })}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {/* What is folded into this entry rather than listed beside it. */}
              {(change.properties?.length || change.relationships?.length) ? (
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                  {change.properties?.length
                    ? t('review.properties', '{{count}} properties', { count: change.properties.length })
                    : null}
                  {change.properties?.length && change.relationships?.length ? ' · ' : null}
                  {change.relationships?.length
                    ? t('review.relationships', '{{count}} relationships', { count: change.relationships.length })
                    : null}
                </div>
              ) : null}

              {/* Who says so. For an agent's proposal this is the only answer a reviewer has, and an
                  unresolvable citation is worth distinguishing from none at all. */}
              {change.evidence?.length ? (
                <div
                  style={{ fontSize: 11, color: '#047857', marginTop: 4 }}
                  title={change.evidence.map((e) => e.quote).join('\n\n')}
                >
                  {change.evidence.some((e) => e.resolvable === false)
                    ? t('review.citedUnresolvable', 'Cited, not re-checkable')
                    : change.evidence[0].label
                      ? t('review.citedFrom', 'Cited · {{label}}', { label: change.evidence[0].label })
                      : t('review.cited', 'Cited')}
                </div>
              ) : null}

              {/* Accepting this alone may leave an edge behind. It must never be silent. */}
              {change.mergeNotes?.map((note) => (
                <div key={note} style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>{note}</div>
              ))}

              {change.decision ? (
                <div style={{ fontSize: 11, color: '#374151', marginTop: 4, textTransform: 'capitalize' }}>
                  {change.decision}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* No callback means the host cannot write — a read-only view must not offer an action it
          would silently swallow. */}
      {onDecide && selectedDecidable.length > 0 ? (
        <div style={{ borderTop: '1px solid #e5e7eb', padding: '12px 16px', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
            {/* A box-selection routinely catches cards another team owns; say so before Accept, not after. */}
            {selectedIds.size === selectedDecidable.length
              ? t('review.selected', '{{count}} selected', { count: selectedIds.size })
              : t('review.selectedPartial', '{{total}} selected, {{count}} you can decide', {
                total: selectedIds.size,
                count: selectedDecidable.length,
              })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => onDecide('accepted', selectedDecidable)}
              style={{
                flex: 1, border: `1px solid ${DIFF_STYLES.add.color}`, color: DIFF_STYLES.add.color,
                background: '#fff', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
              }}
            >
              {t('review.accept', 'Accept')}
            </button>
            <button
              type="button"
              onClick={() => onDecide('rejected', selectedDecidable)}
              style={{
                flex: 1, border: `1px solid ${DIFF_STYLES.remove.color}`, color: DIFF_STYLES.remove.color,
                background: '#fff', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
              }}
            >
              {t('review.reject', 'Reject')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
