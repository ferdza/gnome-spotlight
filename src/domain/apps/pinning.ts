import type { AppEntry } from "@domain/apps/appPorts";

export const togglePinned = (pinned: readonly string[], id: string): string[] =>
  pinned.includes(id) ? pinned.filter((item) => item !== id) : [...pinned, id];

export const orderPinnedFirst = (
  apps: readonly AppEntry[],
  pinned: readonly string[],
): AppEntry[] => {
  const byId = new Map(apps.map((app) => [app.id, app]));
  const first = pinned.flatMap((id) => byId.get(id) ?? []);
  const firstIds = new Set(first.map((app) => app.id));
  return [...first, ...apps.filter((app) => !firstIds.has(app.id))];
};
