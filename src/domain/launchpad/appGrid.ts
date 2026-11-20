import type { AppEntry } from "@domain/apps/appPorts";
import { normalizeText, scoreBestField, type WeightedField } from "@domain/text/textMatcher";

export const GridMove = {
  LEFT: "left",
  RIGHT: "right",
  UP: "up",
  DOWN: "down",
} as const;
export type GridMove = (typeof GridMove)[keyof typeof GridMove];

export interface GridShape {
  readonly columns: number;
  readonly rows: number;
}

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

  constructor(private shape: GridShape) {}

  get columns(): number {
    return this.shape.columns;
  }

  get pageSize(): number {
    return this.shape.columns * this.shape.rows;
  }

  get selectedIndex(): number {
    return this.current;
  }

  get selected(): AppEntry | undefined {
    return this.items[this.current];
  }

  get pageCount(): number {
    return Math.ceil(this.items.length / this.pageSize);
  }

  get pageIndex(): number {
    return this.current < 0 ? 0 : Math.floor(this.current / this.pageSize);
  }

  get pageItems(): readonly AppEntry[] {
    const start = this.pageIndex * this.pageSize;
    return this.items.slice(start, start + this.pageSize);
  }

  setShape(shape: GridShape): void {
    const selected = this.selected;
    this.shape = shape;
    this.selectById(selected?.id);
  }

  setItems(items: readonly AppEntry[]): void {
    this.items = items;
    this.current = items.length > 0 ? 0 : -1;
  }

  selectById(id: string | undefined): void {
    const index = this.items.findIndex((item) => item.id === id);
    this.current = index >= 0 ? index : this.items.length > 0 ? 0 : -1;
  }

  selectOnPage(offset: number): void {
    const index = this.pageIndex * this.pageSize + offset;
    if (index >= 0 && index < this.items.length) this.current = index;
  }

  goToPage(page: number): void {
    if (this.items.length === 0) return;
    const target = Math.min(Math.max(page, 0), this.pageCount - 1);
    const offset = this.current - this.pageIndex * this.pageSize;
    this.current = Math.min(target * this.pageSize + offset, this.items.length - 1);
  }

  move(direction: GridMove): void {
    if (this.items.length === 0) return;

    const { columns } = this.shape;
    const step =
      direction === GridMove.LEFT
        ? -1
        : direction === GridMove.RIGHT
          ? 1
          : direction === GridMove.UP
            ? -columns
            : columns;
    const next = this.current + step;
    if (next < 0 || next >= this.items.length) return;
    this.current = next;
  }
}
