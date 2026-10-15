// Florist-standard stem counts per arrangement type.
//
// These are typical garden-style *starting points* — the same defaults the free
// Wedding Flower Calculator at https://getstemwise.com/tools/wedding-flower-calculator.html
// is built on. Lush, garden-style designs run toward the high end of each range;
// modern and minimal designs run toward the low end. `stems` is the default the
// calculator uses; `range` is the realistic florist spread.

export const ARRANGEMENTS = {
  'bridal-bouquet':     { label: 'Bridal bouquet',               stems: 45,  range: [35, 50] },
  'bridesmaid-bouquet': { label: 'Bridesmaid bouquet',           stems: 22,  range: [18, 25] },
  'flower-crown':       { label: 'Flower crown',                 stems: 15,  range: [12, 18] },
  'boutonniere':        { label: 'Boutonnière',                  stems: 3,   range: [2, 3] },
  'corsage':            { label: 'Corsage',                      stems: 5,   range: [4, 6] },
  'low-centerpiece':    { label: 'Low / compote centerpiece',    stems: 30,  range: [25, 40] },
  'tall-centerpiece':   { label: 'Tall centerpiece',             stems: 50,  range: [40, 60] },
  'ceremony-arch':      { label: 'Ceremony arch / installation', stems: 200, range: [150, 300] },
  'aisle-marker':       { label: 'Aisle / pew marker',           stems: 18,  range: [12, 20] },
  'cake-flowers':       { label: 'Cake flowers',                 stems: 10,  range: [8, 12] },
};

export const ARRANGEMENT_TYPES = Object.keys(ARRANGEMENTS);
