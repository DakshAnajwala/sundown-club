/**
 * bodies.js — the proportion tables that define each vehicle shape.
 *
 * These are pure data. CarModel.js turns them into geometry via BodyLoft.js, so
 * a new silhouette costs a table, not a new builder.
 *
 * ---------------------------- THE SEDAN --------------------------------------
 * A contemporary compact saloon in the Civic idiom. It is NOT a replica and
 * carries no badge, marque or model name: the geometry is generic surfacing in
 * that style, which is the same position NOTES.md already records for this
 * project (procedural geometry, no imported or extracted assets).
 *
 * PROPORTIONS ARE LOCKED TO 4.20 m, not to a real Civic's 4.69 m. That is
 * deliberate and load-bearing. Every clearance in Levels.js — bay pitch >=
 * 2.55 m, parallel gap >= 6.2 m, aisle >= 7.5 m — was computed against a 4.2 m
 * car, and v1 shipped a level that was mathematically impossible to complete by
 * getting exactly this kind of number wrong. What makes a car read as a Civic
 * is the PROPORTION — cab-rearward stance, long low hood, low cowl, deeply
 * raked screen, fastback roof falling into a short deck, one straight beltline
 * — none of which depends on absolute length. Do not "fix" the length.
 *
 * Width note: the body is deliberately a little narrower than the 1.78 m
 * collision box (see Dimensions.CHASSIS_SIZE). A visible body inside its
 * collider is normal practice and slightly forgiving, and the narrower section
 * is what keeps a 4.2 m car from reading as stubby.
 *
 * Cues encoded below:
 *   - beltline dead straight at y = 0.98 for the car's whole length
 *   - cowl at z = -0.72: the screen starts far forward, so the hood is long
 *   - roof peak at z = +0.45, well back: cab-rearward
 *   - roofline falls only 0.04 by the C-pillar then drops fast: fastback
 *   - deck from z = +1.20: short boot
 *   - widest point below the beltline (shoulder at y = 0.78): planted stance
 */

/**
 * A plan-view station: [z, beltHalfWidth, maxHalfWidth, rockerHalfWidth].
 * The section between them is filled in by CarModel's profile() using the
 * shared vertical datums below.
 */
export const SEDAN = {
  name: 'sedan',

  // Vertical datums, ground frame.
  yBelt: 0.98,
  yShoulder: 0.78, // widest point — the character line
  yRocker: 0.34,
  yFloorEdge: 0.245,
  yFloor: 0.205,

  /**
   * [z, beltHalfWidth, maxHalfWidth, rockerHalfWidth, beltY]
   *
   * beltY is per-station and is what stops the nose being a slab. Run the belt
   * flat at 0.98 all the way to the bumper and the front of the car becomes a
   * 0.78 m vertical wall; dropping it to follow the hood line gives the nose
   * its fall-away. It rises again over the cabin (the straight beltline that is
   * the whole point of the profile) and tucks at the tail.
   */
  plan: [
    [-2.1, 0.6755, 0.7093, 0.6079, 0.9],
    [-1.92, 0.772, 0.8058, 0.7141, 0.928],
    [-1.55, 0.8087, 0.8376, 0.7575, 0.951],
    [-1.1, 0.8154, 0.8444, 0.7672, 0.969],
    [-0.3, 0.8154, 0.8444, 0.7672, 0.98],
    [0.6, 0.8154, 0.8444, 0.7672, 0.98],
    [1.2, 0.8125, 0.8396, 0.7623, 0.982],
    [1.65, 0.7932, 0.8183, 0.7382, 0.984],
    [1.95, 0.7508, 0.772, 0.6832, 0.968],
    [2.1, 0.6755, 0.6948, 0.6079, 0.944],
  ],

  /** Hood: [z, y, halfWidth]. Falls away toward the nose. */
  hood: [
    [-2.05, 0.895, 0.68],
    [-1.9, 0.925, 0.79],
    [-1.55, 0.95, 0.835],
    [-1.1, 0.968, 0.845],
    [-0.72, 0.98, 0.85],
  ],

  /** Boot lid: [z, y, halfWidth]. Short, and barely above the beltline. */
  deck: [
    [1.2, 0.995, 0.845],
    [1.62, 0.99, 0.82],
    [1.95, 0.965, 0.775],
    [2.05, 0.945, 0.7],
  ],

  /** Roof: [z, y, halfWidth]. Peak deliberately aft of centre. */
  roof: [
    [-0.05, 1.4, 0.7],
    [0.45, 1.42, 0.71],
    [1.05, 1.38, 0.665],
  ],

  /** Greenhouse corner datums used for glass and pillars. */
  cowlZ: -0.72,
  screenTopZ: -0.05,
  bPillarZ: 0.3,
  roofRearZ: 1.05,
  backlightBaseZ: 1.55,
  backlightBaseY: 1.02,
  glassBeltInset: 0.01, // side glass sits just inboard of the belt
  roofHalfWidthAt: (z) => (z < 0.45 ? 0.7 : 0.71 - (z - 0.45) * 0.075),

  /** Lamp bands: [halfWidthInner, halfWidthOuter, y, height]. */
  headlamp: [0.28, 0.63, 0.855, 0.075],
  taillamp: [0.24, 0.63, 0.898, 0.085], // top stays under the tail's beltline (0.944)

  bumperFrontZ: -2.12,
  bumperRearZ: 2.12,
  wheelArchRadius: 0.42,
};

/** Two-box hatchback: same nose, roof carries back, cut off vertically. */
export const HATCHBACK = {
  ...SEDAN,
  name: 'hatchback',
  plan: [
    [-2.1, 0.6755, 0.7093, 0.6079, 0.9],
    [-1.92, 0.772, 0.8058, 0.7141, 0.928],
    [-1.55, 0.8087, 0.8376, 0.7575, 0.951],
    [-1.1, 0.8154, 0.8444, 0.7672, 0.969],
    [-0.3, 0.8154, 0.8444, 0.7672, 0.98],
    [0.6, 0.8154, 0.8444, 0.7672, 0.98],
    [1.4, 0.8125, 0.8396, 0.7623, 0.99],
    [1.8, 0.8058, 0.828, 0.7479, 1.0],
    [2.02, 0.7672, 0.7865, 0.6996, 0.995],
    [2.1, 0.7141, 0.7334, 0.6321, 0.985],
  ],
  deck: [
    [1.62, 1.02, 0.845],
    [1.9, 1.02, 0.83],
    [2.05, 1.0, 0.75],
  ],
  roof: [
    [-0.05, 1.42, 0.7],
    [0.55, 1.44, 0.715],
    [1.45, 1.4, 0.685],
  ],
  roofRearZ: 1.45,
  backlightBaseZ: 1.72,
  backlightBaseY: 1.05,
};

/** Taller, boxier crossover. Same footprint, more height and less tumblehome. */
export const SUV = {
  ...SEDAN,
  name: 'suv',
  yBelt: 1.12,
  yShoulder: 0.92,
  yRocker: 0.42,
  yFloorEdge: 0.32,
  yFloor: 0.28,
  plan: [
    [-2.1, 0.7141, 0.7382, 0.6562, 1.04],
    [-1.92, 0.8009, 0.828, 0.7527, 1.07],
    [-1.55, 0.8251, 0.8473, 0.7865, 1.09],
    [-1.1, 0.8318, 0.8511, 0.7961, 1.105],
    [-0.3, 0.8318, 0.8511, 0.7961, 1.12],
    [0.6, 0.8318, 0.8511, 0.7961, 1.12],
    [1.4, 0.8299, 0.8473, 0.7932, 1.13],
    [1.8, 0.8183, 0.8347, 0.772, 1.14],
    [2.02, 0.7797, 0.799, 0.7218, 1.135],
    [2.1, 0.7238, 0.743, 0.6543, 1.12],
  ],
  hood: [
    [-2.05, 1.04, 0.72],
    [-1.9, 1.07, 0.82],
    [-1.55, 1.09, 0.85],
    [-1.1, 1.105, 0.86],
    [-0.72, 1.12, 0.862],
  ],
  deck: [
    [1.62, 1.16, 0.855],
    [1.9, 1.15, 0.84],
    [2.05, 1.12, 0.76],
  ],
  roof: [
    [-0.1, 1.62, 0.74],
    [0.55, 1.64, 0.75],
    [1.5, 1.6, 0.72],
  ],
  roofRearZ: 1.5,
  roofRails: true, // a crossover's clearest cue at any distance
  backlightBaseZ: 1.78,
  backlightBaseY: 1.2,
  headlamp: [0.3, 0.655, 0.995, 0.09],
  taillamp: [0.26, 0.655, 1.055, 0.1],
};

/** High-roof panel van: one long box behind a short bonnet. */
export const VAN = {
  ...SEDAN,
  name: 'van',
  yBelt: 1.2,
  yShoulder: 1.0,
  yRocker: 0.4,
  yFloorEdge: 0.3,
  yFloor: 0.26,
  plan: [
    [-2.1, 0.7334, 0.7604, 0.6755, 1.1],
    [-1.95, 0.8106, 0.8376, 0.7623, 1.16],
    [-1.6, 0.8376, 0.8569, 0.799, 1.19],
    [-1.1, 0.8415, 0.8608, 0.8087, 1.2],
    [0.0, 0.8415, 0.8608, 0.8087, 1.2],
    [1.0, 0.8415, 0.8608, 0.8087, 1.2],
    [1.7, 0.8396, 0.8569, 0.8038, 1.2],
    [2.0, 0.828, 0.8444, 0.7797, 1.19],
    [2.1, 0.772, 0.7913, 0.7141, 1.17],
  ],
  hood: [
    [-2.05, 1.1, 0.74],
    [-1.85, 1.16, 0.83],
    [-1.5, 1.19, 0.86],
    [-1.15, 1.2, 0.87],
  ],
  deck: [
    [1.95, 1.86, 0.85],
    [2.08, 1.84, 0.78],
  ],
  roof: [
    [-0.55, 1.86, 0.8],
    [0.6, 1.9, 0.82],
    [1.95, 1.88, 0.8],
  ],
  cowlZ: -1.15,
  screenTopZ: -0.55,
  bPillarZ: -0.1,
  roofRearZ: 1.95,
  roofRails: true,
  backlightBaseZ: 2.06,
  backlightBaseY: 1.3,
  headlamp: [0.32, 0.675, 1.055, 0.1],
  taillamp: [0.28, 0.69, 1.3, 0.28],
};

/** Pickup: sedan-height cab, open bed behind. */
export const PICKUP = {
  ...SUV,
  name: 'pickup',
  roof: [
    [-0.1, 1.58, 0.73],
    [0.35, 1.6, 0.74],
    [0.85, 1.56, 0.71],
  ],
  roofRearZ: 0.85,
  backlightBaseZ: 1.05,
  backlightBaseY: 1.18,
  deck: [
    [1.05, 1.14, 0.85],
    [1.6, 1.13, 0.85],
    [2.0, 1.12, 0.83],
    [2.08, 1.1, 0.76],
  ],
  /** Bed walls, drawn as a raised lip around the deck. */
  bed: { fromZ: 1.05, toZ: 2.05, wallY: 1.16, halfWidth: 0.865 },
};

export const BODY_TYPES = [SEDAN, HATCHBACK, SUV, VAN, PICKUP];

/**
 * Deterministic variant pick. Lots should look composed, not randomised — the
 * same index always yields the same body, so a level looks identical every time
 * it loads, and sedans dominate the way they do in a real car park.
 */
const MIX = [SEDAN, SEDAN, HATCHBACK, SEDAN, SUV, SEDAN, HATCHBACK, SUV, SEDAN, VAN, SEDAN, PICKUP];
export function bodyForIndex(i) {
  return MIX[Math.abs(i) % MIX.length];
}

// ---------------------------------------------------------------------------
// Racing-game bodies (design/SPEC-models.md §3). Same rules as the sedan:
// length locked to the shared 4.20 m chassis (the collider, the axles and the
// wheel arches are shared), so each body reads through its PROPORTIONS: roof
// height, where the cab sits, the roofline, the nose and the tail.
//
// Bodies the player can drive (coupe, fastback) keep the sedan's cowl at
// z = -0.72: Cockpit.js puts the dial cluster at z = -0.62, and a cowl further
// back would bury the cluster in the hood. Lamp housings stay under the nose
// and tail beltline (a housing is lens height + 3 cm).
// ---------------------------------------------------------------------------

/**
 * Two-door coupe: the Tide coupe (Juno's car, the player's from chapter 1).
 * 12 cm lower roof than the sedan, peak further aft, a fastback backlight
 * into a short deck, wider haunches, a lower nose. One long door and a
 * quarter window instead of two doors.
 */
export const COUPE = {
  ...SEDAN,
  name: 'coupe',
  yBelt: 0.97,
  yShoulder: 0.77,
  yRocker: 0.32,
  yFloorEdge: 0.235,
  yFloor: 0.2,
  plan: [
    [-2.1, 0.67, 0.7, 0.6, 0.86],
    [-1.92, 0.78, 0.815, 0.72, 0.895],
    [-1.55, 0.825, 0.855, 0.77, 0.93],
    [-1.1, 0.83, 0.862, 0.778, 0.955],
    [-0.3, 0.826, 0.858, 0.775, 0.97],
    [0.6, 0.83, 0.862, 0.778, 0.97],
    [1.25, 0.835, 0.868, 0.782, 0.975],
    [1.7, 0.81, 0.84, 0.75, 0.975],
    [1.98, 0.76, 0.785, 0.69, 0.96],
    [2.1, 0.68, 0.7, 0.61, 0.935],
  ],
  hood: [
    [-2.05, 0.855, 0.67],
    [-1.9, 0.89, 0.79],
    [-1.55, 0.925, 0.84],
    [-1.1, 0.952, 0.85],
    [-0.72, 0.963, 0.855],
  ],
  deck: [
    [1.3, 0.99, 0.83],
    [1.62, 0.995, 0.81],
    [1.95, 0.975, 0.76],
    [2.05, 0.955, 0.69],
  ],
  roof: [
    [-0.02, 1.285, 0.66],
    [0.38, 1.3, 0.67],
    [0.95, 1.275, 0.625],
  ],
  cowlZ: -0.72,
  screenTopZ: -0.02,
  bPillarZ: 0.55, // rear edge of the long door: the quarter-window divider
  roofRearZ: 0.95,
  backlightBaseZ: 1.62,
  backlightBaseY: 1.015,
  roofHalfWidthAt: (z) => (z < 0.38 ? 0.67 : 0.67 - (z - 0.38) * 0.08),
  headlamp: [0.3, 0.64, 0.815, 0.055],
  taillamp: [0.22, 0.64, 0.885, 0.06],
  handleZ: [0.35],
  shutZ: [-0.66, 0.55],
};

/**
 * Fastback muscle car: Brandt's (Ironside), the chapter 3 car. Blunt, tall,
 * wide nose; long flat hood; screen raked back to z = +0.02; one long sloping
 * glass from the roof to a kicked-up ducktail.
 */
export const FASTBACK = {
  ...SEDAN,
  name: 'fastback',
  yBelt: 1.0,
  yShoulder: 0.8,
  yRocker: 0.34,
  plan: [
    [-2.1, 0.74, 0.77, 0.66, 0.95],
    [-1.95, 0.81, 0.84, 0.74, 0.97],
    [-1.5, 0.83, 0.865, 0.775, 0.985],
    [-0.9, 0.83, 0.865, 0.775, 0.995],
    [-0.2, 0.825, 0.86, 0.77, 1.0],
    [0.6, 0.835, 0.87, 0.78, 1.0],
    [1.3, 0.845, 0.878, 0.79, 1.005],
    [1.8, 0.83, 0.86, 0.77, 1.005],
    [2.02, 0.8, 0.83, 0.73, 1.0],
    [2.1, 0.76, 0.79, 0.69, 0.99],
  ],
  hood: [
    [-2.05, 0.955, 0.73],
    [-1.9, 0.975, 0.8],
    [-1.5, 0.99, 0.84],
    [-1.1, 0.995, 0.845],
    [-0.72, 1.0, 0.85],
  ],
  deck: [
    [1.35, 1.03, 0.84],
    [1.75, 1.035, 0.83],
    [2.0, 1.04, 0.8],
    [2.07, 1.03, 0.75],
  ],
  roof: [
    [0.02, 1.315, 0.66],
    [0.4, 1.33, 0.67],
    [0.95, 1.3, 0.64],
  ],
  cowlZ: -0.72,
  screenTopZ: 0.02,
  bPillarZ: 0.62,
  roofRearZ: 0.95,
  backlightBaseZ: 1.75,
  backlightBaseY: 1.045,
  roofHalfWidthAt: (z) => (z < 0.4 ? 0.67 : 0.67 - (z - 0.4) * 0.055),
  headlamp: [0.34, 0.66, 0.89, 0.07],
  taillamp: [0.06, 0.7, 0.93, 0.06],
  handleZ: [0.42],
  shutZ: [-0.66, 0.62],
};

/**
 * Grand tourer: Voss's car. The longest hood in the game (cowl at z = -0.40)
 * and a small cab pushed back over the rear axle. NOT drivable from the
 * cockpit as built: the cowl is behind Cockpit.js's dial cluster. If Voss's
 * car is ever given to the player, move cowlZ to -0.72 first.
 */
export const GT = {
  ...SEDAN,
  name: 'gt',
  yBelt: 0.95,
  yShoulder: 0.76,
  yRocker: 0.31,
  yFloorEdge: 0.23,
  yFloor: 0.195,
  plan: [
    [-2.1, 0.66, 0.69, 0.59, 0.82],
    [-1.92, 0.77, 0.8, 0.71, 0.86],
    [-1.5, 0.82, 0.85, 0.765, 0.9],
    [-0.9, 0.83, 0.86, 0.775, 0.93],
    [-0.2, 0.825, 0.855, 0.77, 0.945],
    [0.5, 0.83, 0.862, 0.775, 0.95],
    [1.2, 0.845, 0.875, 0.79, 0.955],
    [1.7, 0.82, 0.85, 0.755, 0.955],
    [2.0, 0.77, 0.795, 0.7, 0.945],
    [2.1, 0.69, 0.71, 0.62, 0.925],
  ],
  hood: [
    [-2.05, 0.82, 0.66],
    [-1.9, 0.855, 0.78],
    [-1.5, 0.895, 0.835],
    [-0.9, 0.925, 0.845],
    [-0.4, 0.945, 0.85],
  ],
  deck: [
    [1.35, 0.975, 0.83],
    [1.65, 0.975, 0.81],
    [1.95, 0.96, 0.76],
    [2.05, 0.94, 0.69],
  ],
  roof: [
    [0.2, 1.285, 0.64],
    [0.55, 1.3, 0.65],
    [1.0, 1.275, 0.61],
  ],
  cowlZ: -0.4,
  screenTopZ: 0.2,
  bPillarZ: 0.78,
  roofRearZ: 1.0,
  backlightBaseZ: 1.6,
  backlightBaseY: 0.99,
  roofHalfWidthAt: (z) => (z < 0.55 ? 0.65 : 0.65 - (z - 0.55) * 0.09),
  headlamp: [0.3, 0.62, 0.78, 0.045],
  taillamp: [0.2, 0.62, 0.88, 0.05],
  mirrorZ: -0.2,
  seatShift: 0.25, // cab 25 cm further back than the sedan's (CarModel buildInterior)
  deckZ: 1.5, // rear bulkhead behind the shifted bench
  handleZ: [0.5],
  shutZ: [-0.34, 0.78],
};

/**
 * Tow truck cab and flat deck: Mara's truck. The pickup's cab with the bed
 * walls removed; the boom, wheel-lift, toolboxes and beacon are bolted on by
 * StoryCars.js.
 */
export const TOW = {
  ...PICKUP,
  name: 'tow',
  bed: null,
  roofRails: false, // the beacon bar sits there
  deck: [
    [1.05, 1.1, 0.85],
    [1.6, 1.1, 0.85],
    [2.0, 1.1, 0.83],
    [2.08, 1.08, 0.76],
  ],
};

/** Every body table by name (cars.js `body` and story vehicles use these). */
export const BODIES = {
  sedan: SEDAN,
  hatchback: HATCHBACK,
  suv: SUV,
  van: VAN,
  pickup: PICKUP,
  coupe: COUPE,
  fastback: FASTBACK,
  gt: GT,
  tow: TOW,
};
