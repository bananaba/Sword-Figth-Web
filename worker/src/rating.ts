export interface EloInput {
  playerRating: number;
  opponentRating: number;
  /** 1 = win, 0.5 = draw, 0 = loss. */
  score: 1 | 0.5 | 0;
  kFactor?: number;
}

export interface EloResult {
  nextPlayerRating: number;
  nextOpponentRating: number;
  playerDelta: number;
  opponentDelta: number;
}

const DEFAULT_K_FACTOR = 32;

export function expectedScore(playerRating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
}

export function applyEloResult(input: EloInput): EloResult {
  const k = input.kFactor ?? DEFAULT_K_FACTOR;
  const playerExpected = expectedScore(input.playerRating, input.opponentRating);
  const playerDelta = normalizeZero(Math.round(k * (input.score - playerExpected)));
  const opponentDelta = normalizeZero(-playerDelta);

  return {
    nextPlayerRating: input.playerRating + playerDelta,
    nextOpponentRating: input.opponentRating + opponentDelta,
    playerDelta,
    opponentDelta,
  };
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
