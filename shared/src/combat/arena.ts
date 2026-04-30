/**
 * Arena geometry shared by client renderer + ringout detection (solo) +
 * authoritative server. Keeping the radius in one place prevents the
 * "visual platform ends at 4.0 but server doesn't end the round until 4.2"
 * divergence that allowed ranked fighters to slide past the visible rim.
 *
 * The renderer (`Arena3D.tsx`) draws the cylinder/disk/rim at this exact
 * radius; ringout detection (solo `useDuelLoop`, server `duel-session`) and
 * the pre-KO slowmo prediction all read from the same value.
 */
export const ARENA_RADIUS = 4.0;

/** Spawn position of the "player" slot along the duel axis (server frame). */
export const INITIAL_PLAYER_POS = -1.5;

/** Spawn position of the "opponent" slot along the duel axis (server frame). */
export const INITIAL_OPPONENT_POS = 1.5;
