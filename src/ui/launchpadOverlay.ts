import Clutter from "gi://Clutter";
import Pango from "gi://Pango";
import Shell from "gi://Shell";
import St from "gi://St";
import { MonitorConstraint } from "resource:///org/gnome/shell/ui/layout.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { PanelSurface } from "@domain/appearance/panelSurface";
import type { AppCatalog, AppEntry } from "@domain/apps/appPorts";
import { AppGrid, filterApps, GridMove, type GridShape } from "@domain/launchpad/appGrid";
import type { Translate } from "@i18n/translate";
import { toIconProps } from "@ui/searchIconProps";
import { applySurface, BLUR_TARGET_CLASS, ENTRY_INLINE_STYLE } from "@ui/surface";

const SURFACE_CLASSES: Record<PanelSurface, string> = {
  [PanelSurface.GLASS]: "launcher-pad-glass",
  [PanelSurface.SOLID]: "launcher-pad-solid",
};

const TILE_WIDTH = 150;
const TILE_HEIGHT = 140;
const SIDE_SHARE = 0.84;
const RESERVED_HEIGHT = 250;
const MIN_COLUMNS = 3;
const MAX_COLUMNS = 8;
const MIN_ROWS = 2;
const MAX_ROWS = 5;
const OPEN_MS = 240;
const CLOSE_MS = 140;
const PAGE_MS = 200;
const PAGE_SLIDE_PX = 70;
const OPEN_START_SCALE = 1.12;
const CLOSE_END_SCALE = 1.06;

const MOVES = new Map<number, GridMove>([
  [Clutter.KEY_Left, GridMove.LEFT],
  [Clutter.KEY_KP_Left, GridMove.LEFT],
  [Clutter.KEY_Right, GridMove.RIGHT],
  [Clutter.KEY_KP_Right, GridMove.RIGHT],
  [Clutter.KEY_Up, GridMove.UP],
  [Clutter.KEY_KP_Up, GridMove.UP],
  [Clutter.KEY_Down, GridMove.DOWN],
  [Clutter.KEY_KP_Down, GridMove.DOWN],
]);

const ENTER_KEYS = new Set<number>([
  Clutter.KEY_Return,
  Clutter.KEY_KP_Enter,
  Clutter.KEY_ISO_Enter,
]);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const computeShape = (width: number, height: number): GridShape => ({
  columns: clamp(Math.floor((width * SIDE_SHARE) / TILE_WIDTH), MIN_COLUMNS, MAX_COLUMNS),
  rows: clamp(Math.floor((height - RESERVED_HEIGHT) / TILE_HEIGHT), MIN_ROWS, MAX_ROWS),
});

export class LaunchpadOverlay {
  private readonly backdrop: St.Widget;
  private readonly monitorConstraint: MonitorConstraint;
  private readonly content: St.BoxLayout;
  private readonly entry: St.Entry;
  private readonly pageBox: St.BoxLayout;
  private readonly dots: St.BoxLayout;
  private readonly grid = new AppGrid({ columns: MAX_COLUMNS, rows: MAX_ROWS });
  private tiles: St.Button[] = [];
  private grab: Clutter.Grab | null = null;
  private query = "";

  constructor(
    private readonly apps: AppCatalog,
    private readonly t: Translate,
  ) {
    this.entry = new St.Entry({
      style_class: "launcher-pad-entry",
      hint_text: t("Search"),
      can_focus: true,
      x_expand: true,
      style: ENTRY_INLINE_STYLE,
    });
    const field = new St.BoxLayout({
      style_class: "launcher-pad-field",
      x_align: Clutter.ActorAlign.CENTER,
    });
    field.add_child(
      new St.Icon({ style_class: "launcher-entry-icon", icon_name: "edit-find-symbolic" }),
    );
    field.add_child(this.entry);

    this.pageBox = new St.BoxLayout({
      style_class: "launcher-pad-page",
      orientation: Clutter.Orientation.VERTICAL,
      x_align: Clutter.ActorAlign.CENTER,
      y_expand: true,
    });
    this.dots = new St.BoxLayout({
      style_class: "launcher-page-dots",
      x_align: Clutter.ActorAlign.CENTER,
    });

    this.content = new St.BoxLayout({
      style_class: "launcher-pad-content",
      orientation: Clutter.Orientation.VERTICAL,
    });
    this.content.add_child(field);
    this.content.add_child(this.pageBox);
    this.content.add_child(this.dots);

    this.backdrop = new St.Widget({
      style_class: `launcher-pad ${BLUR_TARGET_CLASS}`,
      reactive: true,
    });
    this.monitorConstraint = new MonitorConstraint({});
    this.backdrop.add_constraint(this.monitorConstraint);
    this.backdrop.add_child(this.content);
    this.content.add_constraint(
      new Clutter.BindConstraint({
        source: this.backdrop,
        coordinate: Clutter.BindCoordinate.ALL,
      }),
    );

    this.connectSignals();
  }

  get isOpen(): boolean {
    return this.grab !== null;
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
      return;
    }

    this.open();
  }

  open(): void {
    if (this.isOpen) return;
    if (Main.overview.visible) Main.overview.hide();

    this.backdrop.remove_all_transitions();
    this.content.remove_all_transitions();
    this.backdrop.get_parent()?.remove_child(this.backdrop);

    const monitor = Main.layoutManager.currentMonitor;
    if (monitor) {
      this.monitorConstraint.index = monitor.index;
      this.grid.setShape(computeShape(monitor.width, monitor.height));
    }

    applySurface(this.backdrop, SURFACE_CLASSES);
    Main.layoutManager.modalDialogGroup.add_child(this.backdrop);
    this.grab = Main.pushModal(this.backdrop, { actionMode: Shell.ActionMode.SYSTEM_MODAL });

    this.query = "";
    this.entry.set_text("");
    this.grid.setItems(filterApps(this.apps.list(), ""));
    this.render();
    this.entry.grab_key_focus();
    this.animateIn();
  }

  close(): void {
    if (!this.grab) return;

    Main.popModal(this.grab);
    this.grab = null;
    this.animateOut();
  }

  destroy(): void {
    this.backdrop.remove_all_transitions();
    this.content.remove_all_transitions();
    if (this.grab) {
      Main.popModal(this.grab);
      this.grab = null;
    }
    this.backdrop.destroy();
  }

  private connectSignals(): void {
    this.entry.clutter_text.connect("text-changed", () => this.onQueryChanged());
    this.entry.clutter_text.connect("key-press-event", (_actor, event: Clutter.Event) =>
      this.onKeyPress(event.get_key_symbol()),
    );
    this.backdrop.connect("button-press-event", (_actor, event: Clutter.Event) =>
      this.onBackdropPress(event),
    );
    this.backdrop.connect("scroll-event", (_actor, event: Clutter.Event) =>
      this.onScroll(event.get_scroll_direction()),
    );
  }

  private onQueryChanged(): void {
    const text = this.entry.get_text();
    if (text === this.query) return;

    this.query = text;
    this.grid.setItems(filterApps(this.apps.list(), text));
    this.render();
  }

  private onKeyPress(symbol: number): boolean {
    if (symbol === Clutter.KEY_Escape) {
      this.onEscape();
      return Clutter.EVENT_STOP;
    }

    if (ENTER_KEYS.has(symbol)) {
      this.launch(this.grid.selected);
      return Clutter.EVENT_STOP;
    }

    const move = MOVES.get(symbol);
    if (move) {
      this.moveSelection(move);
      return Clutter.EVENT_STOP;
    }

    const pageStep = this.pageStepOf(symbol);
    if (pageStep !== 0) {
      this.changePage(this.grid.pageIndex + pageStep);
      return Clutter.EVENT_STOP;
    }

    return Clutter.EVENT_PROPAGATE;
  }

  private pageStepOf(symbol: number): number {
    if (symbol === Clutter.KEY_Page_Down) return 1;
    if (symbol === Clutter.KEY_Page_Up) return -1;
    return 0;
  }

  private onEscape(): void {
    if (this.entry.get_text()) {
      this.entry.set_text("");
      return;
    }

    this.close();
  }

  private onScroll(direction: Clutter.ScrollDirection): boolean {
    if (direction === Clutter.ScrollDirection.DOWN || direction === Clutter.ScrollDirection.RIGHT)
      this.changePage(this.grid.pageIndex + 1);
    else if (direction === Clutter.ScrollDirection.UP || direction === Clutter.ScrollDirection.LEFT)
      this.changePage(this.grid.pageIndex - 1);
    else return Clutter.EVENT_PROPAGATE;

    return Clutter.EVENT_STOP;
  }

  private onBackdropPress(event: Clutter.Event): boolean {
    const target = global.stage.get_event_actor(event);
    const isEmptyArea =
      target === this.backdrop ||
      target === this.content ||
      target === this.pageBox ||
      target === this.dots ||
      target?.get_parent() === this.pageBox;
    if (!isEmptyArea) return Clutter.EVENT_PROPAGATE;

    this.close();
    return Clutter.EVENT_STOP;
  }

  private moveSelection(direction: GridMove): void {
    const before = this.grid.pageIndex;
    this.grid.move(direction);
    if (this.grid.pageIndex !== before) {
      this.render(this.grid.pageIndex > before ? 1 : -1);
      return;
    }

    this.syncSelection();
  }

  private changePage(page: number): void {
    const before = this.grid.pageIndex;
    this.grid.goToPage(page);
    if (this.grid.pageIndex === before) return;

    this.render(this.grid.pageIndex > before ? 1 : -1);
  }

  private launch(app: AppEntry | undefined): void {
    if (!app) return;

    this.close();
    this.apps.launch(app.id);
  }

  private render(slide = 0): void {
    this.pageBox.destroy_all_children();
    this.tiles = [];

    const columns = this.grid.columns;
    const items = this.grid.pageItems;
    for (let start = 0; start < items.length; start += columns) {
      const row = new St.BoxLayout({
        style_class: "launcher-pad-row",
        x_align: Clutter.ActorAlign.CENTER,
      });
      items.slice(start, start + columns).forEach((app) => {
        const tile = this.createTile(app);
        this.tiles.push(tile);
        row.add_child(tile);
      });
      this.pageBox.add_child(row);
    }

    this.renderDots();
    this.syncSelection();
    if (slide !== 0) this.animatePage(slide);
  }

  private createTile(app: AppEntry): St.Button {
    const label = new St.Label({
      text: app.name,
      style_class: "launcher-tile-label",
      x_align: Clutter.ActorAlign.CENTER,
    });
    label.clutter_text.ellipsize = Pango.EllipsizeMode.END;

    const box = new St.BoxLayout({
      orientation: Clutter.Orientation.VERTICAL,
      x_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(
      new St.Icon({
        style_class: "launcher-tile-icon",
        x_align: Clutter.ActorAlign.CENTER,
        ...toIconProps(app.icon),
      }),
    );
    box.add_child(label);

    const tile = new St.Button({
      style_class: "launcher-tile",
      child: box,
      can_focus: false,
      accessible_name: app.name,
    });
    tile.connect("clicked", () => this.launch(app));
    return tile;
  }

  private renderDots(): void {
    this.dots.destroy_all_children();
    if (this.grid.pageCount <= 1) return;

    for (let page = 0; page < this.grid.pageCount; page++) {
      const dot = new St.Button({
        style_class: "launcher-page-dot",
        can_focus: false,
        reactive: true,
        accessible_name: String(page + 1),
      });
      if (page === this.grid.pageIndex) dot.add_style_pseudo_class("active");
      dot.connect("clicked", () => this.changePage(page));
      this.dots.add_child(dot);
    }
  }

  private syncSelection(): void {
    const selected = this.grid.selected?.id;
    const items = this.grid.pageItems;
    this.tiles.forEach((tile, index) => {
      if (items[index]?.id === selected) tile.add_style_pseudo_class("selected");
      else tile.remove_style_pseudo_class("selected");
    });
  }

  private animatePage(direction: number): void {
    this.pageBox.remove_all_transitions();
    this.pageBox.set({ opacity: 0, translationX: direction * PAGE_SLIDE_PX });
    this.pageBox.ease({
      opacity: 255,
      translationX: 0,
      duration: PAGE_MS,
      mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
    });
  }

  private animateIn(): void {
    this.backdrop.set({ opacity: 0 });
    this.backdrop.ease({
      opacity: 255,
      duration: OPEN_MS,
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });

    this.content.set_pivot_point(0.5, 0.5);
    this.content.set({ scaleX: OPEN_START_SCALE, scaleY: OPEN_START_SCALE });
    this.content.ease({
      scaleX: 1,
      scaleY: 1,
      duration: OPEN_MS,
      mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
    });
  }

  private animateOut(): void {
    this.content.ease({
      scaleX: CLOSE_END_SCALE,
      scaleY: CLOSE_END_SCALE,
      duration: CLOSE_MS,
      mode: Clutter.AnimationMode.EASE_IN_QUAD,
    });
    this.backdrop.ease({
      opacity: 0,
      duration: CLOSE_MS,
      mode: Clutter.AnimationMode.EASE_IN_QUAD,
      onComplete: () => {
        if (!this.grab) this.backdrop.get_parent()?.remove_child(this.backdrop);
      },
    });
  }
}
