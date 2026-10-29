// A relationship's cardinality in the short form an ER diagram uses.
const MULTIPLICITY_SHORT = { OneToOne: '1:1', OneToMany: '1:n', ManyToOne: 'n:1', ManyToMany: 'n:m' };

export function multiplicityShort(multiplicity) {
  return MULTIPLICITY_SHORT[multiplicity] || multiplicity;
}
