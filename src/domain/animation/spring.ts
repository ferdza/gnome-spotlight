export interface SpringSpec {
  readonly response: number;
  readonly damping: number;
}

export const SPRING_SMOOTH: SpringSpec = { response: 0.5, damping: 1 };
export const SPRING_SNAPPY: SpringSpec = { response: 0.38, damping: 0.86 };
export const SPRING_DEFAULT: SpringSpec = { response: 0.55, damping: 0.825 };
export const SPRING_BOUNCY: SpringSpec = { response: 0.5, damping: 0.66 };

const SETTLE_ENVELOPE = 0.002;
const MAX_SETTLE_SECONDS = 2;

const angularFrequency = (spec: SpringSpec): number => (2 * Math.PI) / spec.response;

export const springProgress = (seconds: number, spec: SpringSpec): number => {
  if (seconds <= 0) return 0;

  const omega = angularFrequency(spec);
  const zeta = Math.min(Math.max(spec.damping, 0.05), 1);
  const decay = Math.exp(-zeta * omega * seconds);
  if (zeta === 1) return 1 - decay * (1 + omega * seconds);

  const dampedOmega = omega * Math.sqrt(1 - zeta * zeta);
  return (
    1 -
    decay *
      (Math.cos(dampedOmega * seconds) +
        ((zeta * omega) / dampedOmega) * Math.sin(dampedOmega * seconds))
  );
};

export const springSettleSeconds = (spec: SpringSpec): number => {
  const zeta = Math.min(Math.max(spec.damping, 0.05), 1);
  const seconds = -Math.log(SETTLE_ENVELOPE) / (zeta * angularFrequency(spec));
  return Math.min(seconds * (zeta === 1 ? 1.4 : 1), MAX_SETTLE_SECONDS);
};
