import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DIFF_STYLES } from './diffStyles';

/**
 * The list a reviewer works through, alongside the graph.
 *
 * One entry per changed concept. An inline property and a relationship are not entries of their own
 * — they are reviewed as part of the concept they hang off, and are summarised inside its entry. A
 * shared property does get its own entry, because its change lands on every concept carrying it.
 *
 * Selection is shared with the graph rather than owned here: clicking an entry selects its node and
 * vice versa, and a box-selection in the graph fills this list. That is the whole reason the graph is
 * worth having as an instrument — it is where you can see that six changes are one coherent subgraph.
 */
export default function ReviewPanel({
  changes,
  selectedIds,
  onSelectionChange,
  onFocus,
  onDecide,
  height,
}) {
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
    <div className="sv-review-panel" style={{ height }}>
      <div className="sv-review-panel__head">
        <span className="sv-review-panel__title">{t('review.title', 'Proposal')}</span>
        <span className="sv-review-panel__count">
          {t('review.pending', '{{count}} to review', { count: decidable.size })}
        </span>
      </div>

      <ul className="sv-review-panel__list">
        {changes.map((change) => {
          const style = DIFF_STYLES[change.op] || DIFF_STYLES.modify;
          const isSelected = selectedIds.has(change.externalId);
          return (
            <li
              key={change.externalId || '__namespace__'}
              className={[
                'sv-review-card',
                isSelected ? 'is-selected' : '',
                change.decision ? `is-${change.decision}` : '',
              ].join(' ').trim()}
              onClick={(e) => { toggle(change.externalId, e.metaKey || e.ctrlKey || e.shiftKey); onFocus?.(change.externalId); }}
            >
              <div className="sv-review-card__head">
                <span className="sv-review-card__badge" style={{ color: style.color, borderColor: style.color }}>
                  {style.symbol}
                </span>
                <span className="sv-review-card__name">{change.name || change.externalId}</span>
                <span className="sv-review-card__type">{change.elementType}</span>
              </div>

              {change.owningTeam ? (
                <div className="sv-review-card__team">{change.owningTeam}</div>
              ) : null}

              {/* What is folded into this entry rather than listed beside it. */}
              {(change.properties?.length || change.relationships?.length) ? (
                <div className="sv-review-card__folded">
                  {change.properties?.length
                    ? t('review.properties', '{{count}} properties', { count: change.properties.length })
                    : null}
                  {change.properties?.length && change.relationships?.length ? ' · ' : null}
                  {change.relationships?.length
                    ? t('review.relationships', '{{count}} relationships', { count: change.relationships.length })
                    : null}
                </div>
              ) : null}

              {change.evidence?.length ? (
                <div className="sv-review-card__evidence">{t('review.cited', 'Cited')}</div>
              ) : null}

              {/* Invariant: accepting this alone may leave an edge behind. Never silent. */}
              {change.mergeNotes?.map((note) => (
                <div key={note} className="sv-review-card__note">{note}</div>
              ))}

              {change.decision ? (
                <div className="sv-review-card__decision">{change.decision}</div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {selectedDecidable.length > 0 ? (
        <div className="sv-review-panel__actions">
          <span className="sv-review-panel__selection">
            {selectedIds.size === selectedDecidable.length
              ? t('review.selected', '{{count}} selected', { count: selectedIds.size })
              : t('review.selectedPartial', '{{total}} selected, {{count}} you can decide', {
                total: selectedIds.size,
                count: selectedDecidable.length,
              })}
          </span>
          <button type="button" className="sv-review-panel__accept" onClick={() => onDecide('accepted', selectedDecidable)}>
            {t('review.accept', 'Accept')}
          </button>
          <button type="button" className="sv-review-panel__reject" onClick={() => onDecide('rejected', selectedDecidable)}>
            {t('review.reject', 'Reject')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
