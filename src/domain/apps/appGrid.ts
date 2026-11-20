import type { AppEntry } from "@domain/apps/appPorts";
import { normalizeText, scoreBestField, type WeightedField } from "@domain/text/textMatcher";

export const GridMove = {
  LEFT: "left",
  RIGHT: "right",
  UP: "up",
  DOWN: "down",
} as const;
export type GridMove = (typeof GridMove)[keyof typeof GridMove];

const buildFields = (app: AppEntry): WeightedField[] => [
  { value: app.name, weight: 1 },
  { value: app.genericName, weight: 0.8 },
  ...app.keywords.map((keyword) => ({ value: keyword, weight: 0.8 })),
  { value: app.executable, weight: 0.7 },
];

const byName = (left: AppEntry, right: AppEntry): number =>
  normalizeText(left.name).localeCompare(normalizeText(right.name));

export const filterApps = (apps: readonly AppEntry[], query: string): AppEntry[] => {
  const term = query.trim();
  if (!term) return [...apps].sort(byName);

  return apps
    .map((app) => ({ app, score: scoreBestField(term, buildFields(app)) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || byName(left.app, right.app))
    .map(({ app }) => app);
};

export class AppGrid {
  private items: readonly AppEntry[] = [];
  private current = -1;

  constructor(readonly columns: number) {}

  get entries(): readonly AppEntry[] {
    return this.items;
  }

  get selectedIndex(): number {
    return this.current;
  }

  get selected(): AppEntry | undefined {
    return this.items[this.current];
  }

  setItems(items: readonly AppEntry[]): void {
    this.items = items;
    this.current = items.length > 0 ? 0 : -1;
  }

  select(index: number): void {
    if (index >= 0 && index < this.items.length) this.current = index;
  }

  move(direction: GridMove): void {
    if (this.items.length === 0) return;

    const last = this.items.length - 1;
    const next = {
      [GridMove.LEFT]: this.current - 1,
      [GridMove.RIGHT]: this.current + 1,
      [GridMove.UP]: this.current - this.columns,
      [GridMove.DOWN]: this.reachDown(last),
    }[direction];
    if (next < 0 || next > last) return;
    this.current = next;
  }

  private reachDown(last: number): number {
    const next = this.current + this.columns;
    const isLastRow = Math.floor(this.current / this.columns) === Math.floor(last / this.columns);
    return next > last && !isLastRow ? last : next;
  }
}
