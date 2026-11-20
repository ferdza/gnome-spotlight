import Clutter from "gi://Clutter";

import {
  SPRING_SMOOTH,
  springProgress,
  springSettleSeconds,
  type SpringSpec,
} from "@domain/animation/spring";

export type MotionProperty =
  | "opacity"
  | "scale_x"
  | "scale_y"
  | "translation_x"
  | "translation_y"
  | "height";

export type MotionTargets = Partial<Record<MotionProperty, number>>;

export interface MotionOptions {
  readonly spring?: SpringSpec;
  readonly delay?: number;
  readonly onComplete?: () => void;
}

const MAX_OPACITY = 255;
const running = new WeakMap<Clutter.Actor, Map<MotionProperty, Clutter.Timeline>>();

const readProperty = (actor: Clutter.Actor, property: MotionProperty): number =>
  property === "height" ? actor.get_height() : actor[property];

const writeProperty = (actor: Clutter.Actor, property: MotionProperty, value: number): void => {
  if (property === "height") actor.set_height(Math.max(0, value));
  else if (property === "opacity")
    actor.opacity = Math.round(Math.min(Math.max(value, 0), MAX_OPACITY));
  else actor[property] = value;
};

const ownersOf = (actor: Clutter.Actor): Map<MotionProperty, Clutter.Timeline> => {
  const owners = running.get(actor) ?? new Map<MotionProperty, Clutter.Timeline>();
  running.set(actor, owners);
  return owners;
};

export const stopMotion = (actor: Clutter.Actor, properties?: readonly MotionProperty[]): void => {
  const owners = running.get(actor);
  if (!owners) return;

  const stopped = new Set<Clutter.Timeline>();
  for (const [property, timeline] of [...owners]) {
    if (properties && !properties.includes(property)) continue;
    owners.delete(property);
    stopped.add(timeline);
  }

  const alive = new Set(owners.values());
  stopped.forEach((timeline) => {
    if (!alive.has(timeline)) timeline.stop();
  });
};

export const springTo = (
  actor: Clutter.Actor,
  targets: MotionTargets,
  { spring = SPRING_SMOOTH, delay = 0, onComplete }: MotionOptions = {},
): void => {
  const properties = Object.keys(targets) as MotionProperty[];
  if (properties.length === 0) return;

  stopMotion(actor, properties);

  const starts = new Map(properties.map((property) => [property, readProperty(actor, property)]));
  const timeline = new Clutter.Timeline({
    actor,
    duration: Math.ceil(springSettleSeconds(spring) * 1000),
    delay,
  });
  const owners = ownersOf(actor);
  properties.forEach((property) => owners.set(property, timeline));

  const apply = (progress: number): void => {
    for (const property of properties) {
      if (owners.get(property) !== timeline) continue;
      const from = starts.get(property) ?? 0;
      const to = targets[property] ?? from;
      writeProperty(actor, property, from + (to - from) * progress);
    }
  };

  const release = (): void => {
    for (const property of properties) {
      if (owners.get(property) === timeline) owners.delete(property);
    }
  };

  timeline.connect("new-frame", (_timeline: Clutter.Timeline, elapsed: number) =>
    apply(springProgress(elapsed / 1000, spring)),
  );
  timeline.connect("completed", () => {
    apply(1);
    release();
    onComplete?.();
  });
  timeline.start();
};
