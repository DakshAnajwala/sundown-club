/**
 * Dimensions.js — every hard number about the car, in one place.
 *
 * Physics, the visual shell, the cockpit props, the driver's arm IK, the
 * first-person eye and the backup camera all have to agree about where things
 * are to within a couple of centimetres. When those numbers live in five
 * files they drift, and you get the classic symptoms: hands hovering next to
 * the wheel, a camera inside the dashboard, wheels floating off the car.
 *
 * ------------------------------- CONVENTIONS -------------------------------
 * Local axes (right-handed, matching THREE's default camera frame):
 *     -Z is FORWARD      +X is RIGHT      +Y is UP
 *
 * This is not arbitrary. It was measured with tools/physics-probe.mjs:
 * a POSITIVE cannon-es engine force drives the chassis toward local -Z, and a
 * POSITIVE steering value yaws it left. Adopting -Z as forward means the
 * drive force needs no sign flip, and a THREE.PerspectiveCamera (which looks
 * down its own -Z) can take the chassis quaternion directly with no 180-degree
 * correction. v1-v3 used +Z as forward and paid for it with sign hacks in
 * three separate files.
 *
 * Two vertical frames are in play:
 *   - GROUND frame: y = 0 at the tarmac. Intuitive for authoring the body.
 *   - LOCAL frame:  y = 0 at the chassis body's centre, which rests
 *     RIDE_HEIGHT above the tarmac. This is what THREE/cannon actually use.
 * Author in the ground frame, convert with fromGround().
 */

/** Chassis collision box, full extents [width, height, length]. */
export const CHASSIS_SIZE = [1.78, 1.0, 4.2];

/**
 * Distance from the chassis origin to a bumper face (front or rear — the box
 * is symmetric front/back), local |z|. The single shared "0" that
 * ParkingSensors.js and BackupCamera.js both measure distance from, so their
 * numbers and their on-screen guideline markers can never drift apart again.
 */
export const BUMPER_Z = CHASSIS_SIZE[2] / 2;

/**
 * Height of the chassis centre above the tarmac at rest.
 * Derived, not guessed: the suspension settles where spring force balances
 * weight. cannon-es computes suspensionForce = stiffness * compression * mass,
 * so per wheel at equilibrium compression = g / (4 * stiffness) = 9.82/(4*55)
 * = 0.0446 m. Wheel centre then sits at WHEEL_RADIUS, the connection point at
 * WHEEL_RADIUS + SUSPENSION_REST - compression = 0.33 + 0.28 - 0.045 = 0.565,
 * and the chassis centre at 0.565 - WHEEL_CONNECT_Y. Confirmed by the probe:
 * the car settles at 0.72 and stays there.
 */
export const RIDE_HEIGHT = 0.72;

export const WHEEL_RADIUS = 0.33;
export const WHEEL_WIDTH = 0.24;
export const WHEELBASE = 2.62; // front axle to rear axle
// Track narrowed with the body (bodies.js) so the wheel faces stay flush with
// the flanks instead of standing proud of them. 2.7% narrower than the value
// the handling probe measured with, which is well inside the noise.
export const TRACK = 1.46; // centre to centre across an axle
export const SUSPENSION_REST = 0.28;
export const SUSPENSION_STIFFNESS = 55;

/** Where the springs attach, in LOCAL frame y. See RIDE_HEIGHT's derivation. */
export const WHEEL_CONNECT_Y = -0.155;

export const AXLE_Z = WHEELBASE / 2; // front wheels at -AXLE_Z, rear at +AXLE_Z

/** Ground-frame y -> local-frame y. */
export const fromGround = (y) => y - RIDE_HEIGHT;

/**
 * Cabin landmarks, ground frame, converted once here. Left-hand drive: the
 * driver sits at negative x. (Assumption — the spec doesn't say which side.
 * Flip the sign of DRIVER_X and everything else follows.)
 */
export const DRIVER_X = -0.36;

/**
 * Driver's eye (default seat position), 1.20 m up and looking 6 degrees down.
 *
 * History: it was 1.16 m looking dead level, and players could not see ahead.
 * Level meant the top half of the frame was headliner, and at 1.16 the
 * instrument cluster's top edge (1.195) stood ABOVE the eye, so straight ahead
 * there was no road at all — only the binnacle. Raising the eye 4 cm, tilting
 * 6 degrees down and lowering the dash (DASH_TOP_Y) puts the road over the nose
 * in view above the cluster, and the reversing screen fully above the dash.
 *
 * Players can move this in Settings (SEAT_ADJUST). The shoulders do not move
 * with it, so the arm IK is unaffected — see SEAT_ADJUST for the limits that
 * keeps honest. Must stay below the ~1.42 m roofline (roofs are DoubleSide
 * precisely because the eye is below them).
 */
export const EYE = [DRIVER_X, fromGround(1.2), 0.32];
export const EYE_TILT_DEG = -6;

/**
 * Player seat/camera adjustment limits, as offsets from EYE (metres) and
 * absolute tilt (degrees). z is tight on purpose: the shoulders sit at
 * z = 0.42, 0.10 m behind the eye, so moving the eye back more than ~0.08
 * brings the upper arms into frame as giant blobs (a first-session bug), and
 * forward past -0.12 puts the wheel rim inside the near plane. y tops out 18 cm
 * below the headliner so the lean poses can't push the lens through it.
 */
export const SEAT_ADJUST = {
  x: [-0.15, 0.15],
  y: [-0.08, 0.14],
  z: [-0.12, 0.08],
  tiltDeg: [-20, 6],
};

/**
 * Steering wheel hub centre, and how far the wheel plane is laid back.
 *
 * z = -0.16 is set by ARM REACH, not by taste. The upper arm + forearm total
 * 0.60 m. With the hub at -0.42 (a plausible-looking first guess) the 2
 * o'clock grip point sits 0.88 m from the shoulder joint and the IK simply
 * cannot get there — the hands hover in front of the rim with the arms
 * straight. At -0.16 the same grip point is 0.54 m away, which leaves a
 * natural elbow bend. Checked: the rim's forward-most point reaches z = -0.23,
 * clear of the dash face at -0.38, and the driver's sightline to the
 * instrument cluster passes above the rim.
 *
 * y = 0.86 (was 0.90): once the eye rose to 1.20 and the cluster dropped onto
 * the lowered dash, the rim's top arc and 12 o'clock marker cut straight
 * through the middle of the dials. At 0.86 the sightline over the rim meets the
 * cluster plane at 0.894, 5 cm below its bottom edge. Reach barely moves (the
 * worst rim angle goes 0.691 -> 0.688 m from the shoulder).
 */
export const WHEEL_HUB = [DRIVER_X, fromGround(0.86), -0.16];
export const WHEEL_RIM_RADIUS = 0.175;
export const WHEEL_TILT_RAD = (22 * Math.PI) / 180; // from vertical, leaning back

/**
 * Sport 3-spoke wheel (SteeringWheel.js, RimCurve.js). Designed and tuned in
 * design/wheel-lab; design/SPEC-wheel-hands.md records why each value is what
 * it is. R, the hub and the tilt above are deliberately NOT part of this: they
 * are pinned by arm reach and the cluster sightline.
 *
 *   rimTube        tube radius (was an inline 0.022 on the torus)
 *   flatHalfDeg    the flat bottom spans 6 o'clock ± this
 *   rimFillet      corner softening, metres of smooth-min width
 *   dish           the hub plane sits this far BEHIND the rim plane
 *   spokeSide      3 and 9 o'clock spokes: in-plane thickness, depth
 *   spokeLower     6 o'clock spoke: tapered, wider at the hub
 *   hubPad         octagonal pad; front face `proud` in front of the hub plane
 *   thumbGrip      bulge on the rim's inner face at 3 and 9, arc length
 *   stripe         wrapped 12 o'clock band, arc length and radial proudness
 */
export const WHEEL_SPORT = {
  rimTube: 0.025,
  flatHalfDeg: 32,
  rimFillet: 0.024,
  rimSegments: 72,
  rimRadial: 8,
  dish: 0.022,
  spokeSide: { thickness: 0.03, depth: 0.02 },
  spokeLower: { widthHub: 0.058, widthRim: 0.04, depth: 0.02 },
  hubPad: { width: 0.13, height: 0.095, depth: 0.045, chamfer: 0.012, proud: 0.012 },
  hubBezel: 0.006,
  thumbGrip: { length: 0.06, bulge: 0.006 },
  stripe: { length: 0.018, proud: 0.0008 },
};

/**
 * Articulated hand (HandModel.js). Hand-local frame, right hand: origin at the
 * wrist joint, +Y along the palm toward the fingers, +Z out of the palm (the
 * gripping side), +X toward the thumb. The left hand is its mirror image.
 */
export const HAND = {
  palm: { length: 0.08, width: 0.085, thick: 0.026, wristTaper: 0.8 },
  // index, middle, ring, little
  fingerLengths: [0.075, 0.082, 0.078, 0.062],
  fingerSplit: [0.45, 0.3, 0.25],
  fingerThick: [0.017, 0.0135],
  fingerSpacing: 0.02,
  // Knuckle line drops toward the little finger, like a real hand.
  knuckleDrop: [0, 0.002, -0.002, -0.009],
  thumbBase: [0.03, 0.02, 0.004],
  thumbSplayDeg: 52, // how far the thumb points out toward the index side
  thumbLengths: [0.045, 0.032, 0.028],
  thumbThick: 0.019,
  cuff: { width: 0.066, thick: 0.05, length: 0.045 },
  /** The palm point that sits on whatever the hand grips. */
  contact: [0, 0.058, 0.013],
};

/**
 * Hand-over-hand steering and shifting (HandRig.js). Angles in degrees, times
 * in seconds, distances in metres. See design/SPEC-wheel-hands.md §B.6.
 */
export const HAND_RIG = {
  domainLeft: [-160, -20],
  domainRight: [20, 160],
  softMargin: 30,
  rest: 90,
  gripRoll: 62, // where the palm sits around the tube: 0 = driver side, 90 = outer edge
  skinGap: 0.004,
  slipLoosen: 0.012,
  slipLift: 0.005, // contact rides this far off the tube while slipping
  slipLiftRate: 0.04, // m/s, so lifting never jumps
  landingRate: 160, // °/s: how fast a re-grip closes a spoke nudge (longer nudges take longer)
  // Palm shift along the rim at rest, + toward 12 o'clock. Negative: the
  // fingers wrap just below the side spoke and the thumb lies on the rim above it.
  spokePalmOffset: -6,
  spokeOffsetRate: 25,
  spokeClear: 12,
  // At rest the thumb tip lies on the rim this many degrees above the side
  // spoke (a range: the solver and the probe accept anywhere inside it).
  thumbRestAbove: [2, 30],
  thumbRestGap: 0.011, // tip centre off the rim surface: resting, with room for the D-corners
  thumbHoverGap: 0.025, // thumb tip off the rim when gripping away from rest
  thumbStayNear: 0.05, // solver weight keeping a solved thumb near its starting shape
  regripCloseAt: 0.6, // re-grip progress at which the fingers close
  // Touch-down angles for a re-grip (the rim then carries the closing hand).
  targetsCW: { left: -130, right: 50 },
  targetsCCW: { left: -50, right: 130 },
  release: 0.06,
  travel: 0.3, // shortest travel
  travelMax: 0.45,
  travelSpeed: 230, // °/s of rim a travelling hand covers on average, at most
  regrip: 0.07,
  cooldown: 0.1,
  slipRegrip: 0.05,
  settleIdle: 0.25,
  settleTravel: 0.22, // shortest settle travel (settling hops are short and the rim is still)
  settleThreshold: 12,
  releaseLift: 0.018,
  travelLiftAxis: 0.05,
  travelLiftNormal: 0.015,
  shift: { release: 0.16, toKnob: 0.22, hold: 0.3, back: 0.32, peel: 0.09, arc: 0.06 },
  shiftWaitMax: 0.8, // longest a shift waits for the left hand to finish a re-grip
  fingerRate: 1200,
  fingerK: 28,
  poleL: [-0.55, -0.8, 0.2],
  poleR: [0.55, -0.8, 0.2],
  upperArmRadius: 0.046,
  forearmRadius: 0.039,
  forearmSleeve: true, // long sleeves: the cuff then reads as a jacket cuff, not a wristband
  // Solve thumb angles against the wheel at build (HandRig.solveThumbs).
  solveThumbs: true,
};

/** Gear stick pivot on the centre console, and its knob height above it. */
export const SHIFTER_BASE = [0, fromGround(0.66), 0.06];
export const SHIFTER_LENGTH = 0.2;
/**
 * Gate positions. A conventional straight PRND console gate: P is forward
 * (nearest the dash), D is back (nearest the driver's hip). The lever swings
 * fore/aft about its base, so each gear is an angle, not a position.
 */
export const SHIFTER_GATE_RAD = { P: -0.34, R: -0.11, N: 0.12, D: 0.35 };

/**
 * Shoulder joints for the driver's arm IK: just below and a touch behind the
 * eye, which is where a seated person's shoulders actually are.
 */
/**
 * Shoulders, and the arm segment lengths.
 *
 * These are a balancing act between two hard constraints, and the first build
 * got it wrong in both directions at once. The arms must be LONG enough to
 * reach the rim (shoulder to the 2 o'clock grip is ~0.62 m), and the shoulders
 * must be FAR ENOUGH BACK that the upper arms are not filling the lower corners
 * of the screen — at z = 0.36 the shoulder sits 0.25 m from the lens and the
 * upper arm renders as a giant flesh-coloured blob across the frame.
 *
 * z = 0.42 puts the shoulders 0.10 m behind the eye, so the upper arms are
 * mostly behind the camera and what you see is forearms and hands, which is
 * what a first-person driving view should show. 0.32 + 0.34 = 0.66 m of arm
 * then leaves a comfortable bend at 0.62 m of reach instead of a locked-out
 * straight line.
 */
export const SHOULDER_L = [DRIVER_X - 0.235, fromGround(0.99), 0.42];
export const SHOULDER_R = [DRIVER_X + 0.235, fromGround(0.99), 0.42];
export const UPPER_ARM = 0.32;
export const FOREARM = 0.34;

/**
 * Dashboard shelf height, ground frame. Lowered from 1.02: at that height the
 * dash was a wall across the lower third of the view and the reversing screen
 * (centred at 1.03) was half buried inside it. A sloped scuttle panel rises
 * from this shelf to the windscreen base so there is no gap into the tub.
 */
export const DASH_TOP_Y = 0.92;

/**
 * Instrument cluster (in front of the driver) and centre screen.
 *
 * The cluster now sits ON the lowered dash, centred at 1.02: its top edge
 * (1.095) is below the sightline from the eye to the car's nose (~1.10 at the
 * cluster plane), so the road beyond the bonnet is visible above it. Its
 * bottom ~1.5 cm is crossed by the wheel rim's top arc, which is a 2 cm tube —
 * the dials read through it the way they do in a real car.
 *
 * The screen is centred at 1.03 but now 5.5 cm clear of the dash shelf below
 * it and in front of everything (stack, vents) that used to overlap it.
 */
export const CLUSTER_POS = [DRIVER_X, fromGround(1.02), -0.62];
export const CLUSTER_SIZE = [0.42, 0.15];
export const SCREEN_POS = [-0.02, fromGround(1.03), -0.5];
export const SCREEN_SIZE = [0.3, 0.18];

/**
 * Bodywork datums shared by the model, the cabin interior and the camera.
 * The beltline is the single most important number in the whole car: the
 * windscreen starts there, the side glass starts there, the door cards top out
 * there, and the eye sits 0.18 above it.
 */
export const BELT_Y = 0.98;
export const ROOF_Y = 1.42;
export const COWL_Z = -0.72;
export const DECK_Z = 1.2;
export const CABIN_FLOOR_Y = 0.42;

/**
 * Rear-facing reversing camera, on the boot lid above the number plate.
 * z is 2.25, not 2.12: the rear bumper box spans z 2.01-2.19, and a camera
 * at 2.12 sits INSIDE it and renders the inside of its own bumper.
 */
export const REAR_CAM_POS = [0, fromGround(0.92), 2.25];
export const REAR_CAM_FOV = 96;
/** Downward tilt of the reversing camera, radians. */
export const REAR_CAM_PITCH = 0.3;
