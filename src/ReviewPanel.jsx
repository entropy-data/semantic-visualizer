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

/** Published so the canvas can work out which strip of itself is still visible. */
export const CHANGE_LIST_WIDTH = 300;

// A column beside the canvas rather than over it, so the graph is never underneath the list.
/** One tone per verdict, used for the badge and for the faint wash over a settled card. */
const DECISION_TONE = {
  accepted: { text: '#15803d', badge: '#dcfce7', tint: '#f6fefa' },
  rejected: { text: '#b91c1c', badge: '#fee2e2', tint: '#fffafa' },
};

/** Shared with the detail panel, so one change is not two colours in two places. */
const IMPACT_COLORS = {
  structural: '#dc2626',
  descriptive: '#d97706',
  cosmetic: '#64748b',
};

/**
 * What this change did, in the space of one line.
 *
 * Named fields first — they are what a reviewer recognises — then signed counts for what hangs off
 * the concept, because a sign reads faster than a noun.
 */
function describeChange(change, t) {
  const parts = [];
  const fields = (change.fields || []).map((f) => f.field);
  if (fields.length) {
    parts.push(fields.length > 2 ? `${fields.slice(0, 2).join(', ')} +${fields.length - 2}` : fields.join(', '));
  }
  const signed = (items, key) => {
    const added = items.filter((i) => i.op === 'add').length;
    const removed = items.filter((i) => i.op === 'remove').length;
    const changed = items.length - added - removed;
    return [
      added ? `+${added}` : null,
      removed ? `−${removed}` : null,
      changed ? `~${changed}` : null,
    ].filter(Boolean).join(' ') + ' ' + t(key, { count: items.length });
  };
  if (change.properties?.length) parts.push(signed(change.properties, 'review.properties'));
  if (change.relationships?.length) parts.push(signed(change.relationships, 'review.relationships'));
  return parts.join(' · ');
}

const panelStyle = {
  width: CHANGE_LIST_WIDTH,
  flexShrink: 0,
  background: '#fff',
  borderRight: '1px solid #e5e7eb',
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

export default function ReviewPanel({ changes, targetName, selectedIds, onSelectionChange, onFocus, onDecide }) {
  const { t } = useTranslation();

  // Two different questions, and one set was answering both: how much is left to review, and what
  // this reviewer may act on. Conflating them meant a decision could never be changed, because a
  // decided card had left the only set the buttons looked at — while the server has always accepted
  // a second answer, and under finish-then-merge a decision is provisional until someone finishes.
  const pending = useMemo(
    () => new Set(changes.filter((c) => c.decidable !== false && !c.decision).map((c) => c.externalId)),
    [changes],
  );
  const changeable = useMemo(
    () => new Set(changes.filter((c) => c.decidable !== false).map((c) => c.externalId)),
    [changes],
  );
  const selectedDecidable = useMemo(
    () => [...selectedIds].filter((id) => changeable.has(id)),
    [selectedIds, changeable],
  );
  // Whether the buttons are about to change an answer rather than give one for the first time.
  const selectedDecided = useMemo(
    () => selectedDecidable.filter((id) => changes.find((c) => c.externalId === id)?.decision),
    [selectedDecidable, changes],
  );
  const accepted = useMemo(() => changes.filter((c) => c.decision === 'accepted').length, [changes]);
  const rejected = useMemo(() => changes.filter((c) => c.decision === 'rejected').length, [changes]);

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
          {t('review.pending', '{{count}} to review', { count: pending.size })}
        </div>
        {/* What has already been settled, so the state of the whole proposal is legible without
            reading every card — the same question the list view answers with "waiting on". */}
        {(accepted || rejected) ? (
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3, display: 'flex', gap: 10 }}>
            {accepted ? (
              <span style={{ color: DECISION_TONE.accepted.text }}>
                {t('review.summary.accepted', '{{count}} accepted', { count: accepted })}
              </span>
            ) : null}
            {rejected ? (
              <span style={{ color: DECISION_TONE.rejected.text }}>
                {t('review.summary.rejected', '{{count}} rejected', { count: rejected })}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {changes.map((change) => {
          const diff = DIFF_STYLES[change.op] || DIFF_STYLES.modify;
          const isSelected = selectedIds.has(change.externalId);
          const isDecided = Boolean(change.decision);
          const unresolvable = change.evidence?.some((e) => e.resolvable === false);
          const summary = describeChange(change, t);
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
                opacity: change.decidable === false && !isDecided ? 0.75 : 1,
                background: isDecided ? DECISION_TONE[change.decision]?.tint || '#fff' : (
                  change.decidable === false ? '#fafafa' : '#fff'
                ),
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
                {change.impact ? (
                  <span style={{
                    flexShrink: 0,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: IMPACT_COLORS[change.impact] || IMPACT_COLORS.cosmetic,
                  }}>
                    {t(`review.impact.${change.impact}`, change.impact)}
                  </span>
                ) : null}
              </div>

              {/* Why a card will not respond, said on the card. Excluding it from the count is not an
                  explanation, and a reviewer clicking Accept on someone else's element deserves to
                  know before rather than after. */}
              {change.owningTeam ? (
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  {change.owningTeam}
                  {/* The reason, not just the fact. A conflict freezes every card, so reporting the
                      generic "not yours" told a reviewer their own team's change belonged to someone
                      else — the wrong reason, stated with confidence. */}
                  {change.decidable === false && !change.decision ? (
                    <span style={{ color: change.blockedBy === 'conflict' ? '#b45309' : '#9ca3af' }}>
                      {' · '}
                      {change.blockedBy === 'conflict'
                        ? t('review.frozenByConflict', 'frozen by a conflict')
                        : t('review.notYours', "{{team}}'s to decide", { team: change.owningTeam })}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {change.conflictReason ? (
                <div style={{
                  marginTop: 4, fontSize: 11, color: '#92400e', background: '#fffbeb',
                  border: '1px solid #fde68a', borderRadius: 4, padding: '2px 6px',
                }}>
                  {t('review.conflict.' + change.conflictReason, { target: targetName || t('review.conflict.target') })}
                  {/* Who changed it, where a proposal is what changed it. The reviewer's next question
                      after "this conflicts" is "with what", and the answer is a page away. */}
                  {change.conflictSource ? (
                    <>
                      {' ' + t('review.conflict.by') + ' '}
                      <a href={change.conflictSource.href}
                         onClick={(e) => e.stopPropagation()}
                         style={{ color: '#92400e', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                        {change.conflictSource.label}
                      </a>
                    </>
                  ) : null}
                </div>
              ) : null}

              {/* What moved, rather than how much of it. Counting sub-changes said nothing about the
                  concept's own fields, so a card that rewrote a description and reassigned an owner
                  reported only the property hanging off it. */}
              {summary ? (
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{summary}</div>
              ) : null}

              {/* Who says so. For an agent's proposal this is the only answer a reviewer has, and an
                  unresolvable citation is worth distinguishing from none at all. */}
              {change.evidence?.length ? (
                <div style={{ marginTop: 4 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      borderRadius: 4,
                      padding: '1px 7px',
                      fontSize: 11,
                      fontWeight: 600,
                      // An unresolvable citation is worth telling apart from a sound one: it is a
                      // claim about a source nobody can go back to.
                      color: unresolvable ? '#b45309' : '#047857',
                      background: unresolvable ? '#fffbeb' : '#ecfdf5',
                    }}
                    title={change.evidence.map((e) => e.quote).join('\n\n')}
                  >
                    {unresolvable
                      ? t('review.citedUnresolvable', 'Cited, not re-checkable')
                      : t('review.cited', 'Cited')}
                  </span>
                </div>
              ) : null}

              {/* Accepting this alone may leave an edge behind. It must never be silent. */}
              {change.mergeNotes?.map((note) => (
                <div key={note} style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>{note}</div>
              ))}

              {/* Said as a verdict rather than a whisper: a reviewer coming back to a part-decided
                  proposal is looking for exactly this, and grey text at 55% opacity was hiding it. */}
              {change.decision ? (
                <div style={{ marginTop: 5 }}>
                  <span style={{
                    display: 'inline-block',
                    borderRadius: 4,
                    padding: '1px 7px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: DECISION_TONE[change.decision]?.text || '#374151',
                    background: DECISION_TONE[change.decision]?.badge || '#f3f4f6',
                  }}>
                    {t(`review.decision.${change.decision}`, change.decision)}
                  </span>
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
            {/* Said before the click, since pressing Accept on something already rejected is a
                reversal rather than a decision. */}
            {selectedDecided.length ? (
              <span style={{ color: '#b45309' }}>
                {' · '}
                {t('review.willChange', '{{count}} already decided', { count: selectedDecided.length })}
              </span>
            ) : null}
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
