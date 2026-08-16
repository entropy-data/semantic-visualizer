import React from 'react';
import { useTranslation } from 'react-i18next';

// Amber reads as "from elsewhere" against the blue/green/violet the element types already own,
// so the badge never competes with the type accent for meaning.
const BADGE_COLORS = {
  text: '#92400e',       // amber-800
  background: '#fef3c7', // amber-100
  border: '#fcd34d',     // amber-300
};

/**
 * Marks a node that belongs to another namespace than the diagram being viewed. Namespaces
 * routinely hold same-named concepts — a `Product` of `catalog` can sit right next to the local
 * `Product` — and the two are only distinguishable by where they come from.
 */
export default function NamespaceBadge({ namespace, dimmed = false, size = 'small' }) {
  const { t } = useTranslation();
  if (!namespace) return null;

  const large = size === 'large';
  return (
    <span
      title={t('node.foreignNamespace', { namespace })}
      style={{
        flexShrink: 0,
        maxWidth: 120,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontSize: large ? 11 : 10,
        fontWeight: 600,
        lineHeight: 1.5,
        padding: large ? '2px 8px' : '1px 6px',
        borderRadius: 8,
        color: dimmed ? '#cbd5e1' : BADGE_COLORS.text,
        background: dimmed ? '#f8fafc' : BADGE_COLORS.background,
        border: `1px solid ${dimmed ? '#e2e8f0' : BADGE_COLORS.border}`,
      }}
    >
      {namespace}
    </span>
  );
}

export { BADGE_COLORS };
