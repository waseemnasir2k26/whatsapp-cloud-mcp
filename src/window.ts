export const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface WindowState {
  open: boolean;
  lastInboundAt: string | null;
  expiresAt: string | null;
  msRemaining: number;
}

/** The 24h customer-service window runs from the customer's LAST inbound message. At exactly 24h it is closed. */
export function windowState(
  lastInbound: number | undefined,
  now: number,
): WindowState {
  if (lastInbound === undefined)
    return {
      open: false,
      lastInboundAt: null,
      expiresAt: null,
      msRemaining: 0,
    };
  const exp = lastInbound + WINDOW_MS;
  const rem = exp - now;
  return {
    open: rem > 0,
    lastInboundAt: new Date(lastInbound).toISOString(),
    expiresAt: new Date(exp).toISOString(),
    msRemaining: Math.max(0, rem),
  };
}
