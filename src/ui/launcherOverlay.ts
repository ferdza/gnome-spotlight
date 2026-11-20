import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import Pango from "gi://Pango";
import Shell from "gi://Shell";
import St from "gi://St";
import { ensureActorVisibleInScrollView } from "resource:///org/gnome/shell/misc/animationUtils.js";
import { MonitorConstraint } from "resource:///org/gnome/shell/ui/layout.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { PanelSurface } from "@domain/appearance/panelSurface";
import { AppGrid, filterApps, GridMove } from "@domain/apps/appGrid";
import type { AppCatalog, AppEntry } from "@domain/apps/appPorts";
import { toFilesQuery } from "@domain/files/pathQuery";
import { getResultLabel } from "@domain/search/resultKindLabel";
import type { SearchResult } from "@domain/search/searchResult";
import type { Translate } from "@i18n/translate";
import type { LauncherPresenter, LauncherView } from "@ui/launcherPresenter";
import { ResultRow } from "@ui/resultRow";
import { toIconProps } from "@ui/searchIconProps";
import { applySurface, BLUR_TARGET_CLASS, ENTRY_INLINE_STYLE } from "@ui/surface";

export type LauncherListener = Pick<
  LauncherPresenter,
  | "onQueryChanged"
  | "onMoveSelection"
  | "onActivateSelected"
  | "onActivateAt"
  | "onComplete"
  | "onEscape"
  | "reset"
>;

const BrowseMode = {
  APPS: "apps",
  FILES: "files",
} as const;
type BrowseMode = (typeof BrowseMode)[keyof typeof BrowseMode];

interface BubbleSpec {
  readonly mode: BrowseMode;
  readonly icon: string;
  readonly key: number;
  readonly label: (t: Translate) => string;
}

const BUBBLES: readonly BubbleSpec[] = [
  {
    mode: BrowseMode.APPS,
    icon: "view-app-grid-symbolic",
    key: Clutter.KEY_1,
    label: (t) => t("Applications"),
  },
  {
    mode: BrowseMode.FILES,
    icon: "folder-symbolic",
    key: Clutter.KEY_2,
    label: (t) => t("Files"),
  },
];

const SEARCH_ICON = "edit-find-symbolic";
const APP_COLUMNS = 5;
const TOP_OFFSET_RATIO = 0.25;
const OPEN_ANIMATION_MS = 220;
const FADE_ANIMATION_MS = 130;
const OPEN_START_SCALE = 0.9;
const RESULTS_SLIDE_PX = 8;
const REVEAL_DELAY_MS = 650;
const BUBBLE_ANIMATION_MS = 360;
const BUBBLE_STAGGER_MS = 70;
const BUBBLE_START_SCALE = 0.3;
const BUBBLE_TRAVEL_PX = 56;

const PANEL_SURFACE_CLASSES: Record<PanelSurface, string> = {
  [PanelSurface.GLASS]: "launcher-panel-glass",
  [PanelSurface.SOLID]: "launcher-panel-solid",
};

type KeyAction = (listener: LauncherListener, text: string) => void;

const KEY_ACTIONS = new Map<number, KeyAction>([
  [Clutter.KEY_Up, (listener) => listener.onMoveSelection(-1)],
  [Clutter.KEY_KP_Up, (listener) => listener.onMoveSelection(-1)],
  [Clutter.KEY_Down, (listener) => listener.onMoveSelection(1)],
  [Clutter.KEY_KP_Down, (listener) => listener.onMoveSelection(1)],
  [Clutter.KEY_Return, (listener) => void listener.onActivateSelected()],
  [Clutter.KEY_KP_Enter, (listener) => void listener.onActivateSelected()],
  [Clutter.KEY_ISO_Enter, (listener) => void listener.onActivateSelected()],
  [Clutter.KEY_Tab, (listener) => listener.onComplete()],
]);

const GRID_MOVES = new Map<number, GridMove>([
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

export class LauncherOverlay implements LauncherView {
  private readonly backdrop: St.Widget;
  private readonly monitorConstraint: MonitorConstraint;
  private readonly row: St.BoxLayout;
  private readonly panel: St.BoxLayout;
  private readonly entry: St.Entry;
  private readonly entryIcon: St.Icon;
  private readonly separator: St.Widget;
  private readonly scrollView: St.ScrollView;
  private readonly resultsBox: St.BoxLayout;
  private readonly appScroll: St.ScrollView;
  private readonly appBox: St.BoxLayout;
  private readonly bubbleBox: St.BoxLayout;
  private readonly bubbles = new Map<BrowseMode, St.Button>();
  private readonly appGrid = new AppGrid(APP_COLUMNS);
  private rows: ResultRow[] = [];
  private tiles: St.Button[] = [];
  private mode: BrowseMode | null = null;
  private bubblesShown = false;
  private revealSource = 0;
  private grab: Clutter.Grab | null = null;
  private listener: LauncherListener | null = null;

  constructor(
    private readonly t: Translate,
    private readonly apps: AppCatalog,
  ) {
    this.entryIcon = new St.Icon({ style_class: "launcher-entry-icon", icon_name: SEARCH_ICON });
    this.entry = new St.Entry({
      style_class: "launcher-entry",
      hint_text: this.defaultHint(),
      can_focus: true,
      x_expand: true,
      primary_icon: this.entryIcon,
      style: ENTRY_INLINE_STYLE,
    });

    this.separator = new St.Widget({ style_class: "launcher-separator", visible: false });

    this.resultsBox = new St.BoxLayout({
      style_class: "launcher-results",
      orientation: Clutter.Orientation.VERTICAL,
      x_expand: true,
    });
    this.scrollView = new St.ScrollView({
      style_class: "launcher-scroll",
      hscrollbar_policy: St.PolicyType.NEVER,
      vscrollbar_policy: St.PolicyType.AUTOMATIC,
      overlay_scrollbars: true,
      child: this.resultsBox,
      visible: false,
    });

    this.appBox = new St.BoxLayout({
      style_class: "launcher-apps",
      orientation: Clutter.Orientation.VERTICAL,
      x_expand: true,
    });
    this.appScroll = new St.ScrollView({
      style_class: "launcher-scroll",
      hscrollbar_policy: St.PolicyType.NEVER,
      vscrollbar_policy: St.PolicyType.AUTOMATIC,
      overlay_scrollbars: true,
      child: this.appBox,
      visible: false,
    });

    this.panel = new St.BoxLayout({
      style_class: `launcher-panel ${BLUR_TARGET_CLASS}`,
      orientation: Clutter.Orientation.VERTICAL,
      reactive: true,
    });
    this.panel.add_child(this.entry);
    this.panel.add_child(this.separator);
    this.panel.add_child(this.scrollView);
    this.panel.add_child(this.appScroll);

    this.bubbleBox = new St.BoxLayout({
      style_class: "launcher-bubbles",
      y_align: Clutter.ActorAlign.START,
    });
    BUBBLES.forEach((spec) => this.bubbleBox.add_child(this.createBubble(spec)));

    this.row = new St.BoxLayout({});
    this.row.add_child(this.panel);
    this.row.add_child(this.bubbleBox);

    this.backdrop = new St.Widget({ reactive: true });
    this.monitorConstraint = new MonitorConstraint({});
    this.backdrop.add_constraint(this.monitorConstraint);
    this.backdrop.add_child(this.row);
    this.row.add_constraint(
      new Clutter.AlignConstraint({
        source: this.backdrop,
        align_axis: Clutter.AlignAxis.X_AXIS,
        factor: 0.5,
      }),
    );

    this.hideBubbles();
    this.connectSignals();
  }

  attach(listener: LauncherListener): void {
    this.listener = listener;
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

    this.placeOnCurrentMonitor();
    this.applyPanelSurface();
    Main.layoutManager.modalDialogGroup.add_child(this.backdrop);

    this.grab = Main.pushModal(this.backdrop, { actionMode: Shell.ActionMode.SYSTEM_MODAL });
    this.setMode(null);
    this.entry.set_text("");
    this.listener?.reset();
    this.entry.grab_key_focus();
    this.animateIn();
    this.scheduleReveal();
  }

  close(): void {
    if (!this.grab) return;

    this.cancelReveal();
    Main.popModal(this.grab);
    this.grab = null;
    this.backdrop.get_parent()?.remove_child(this.backdrop);
  }

  destroy(): void {
    this.listener?.reset();
    this.listener = null;
    this.close();
    this.backdrop.destroy();
  }

  renderResults(results: readonly SearchResult[], selectedIndex: number): void {
    if (this.mode === BrowseMode.APPS) return;

    this.resultsBox.destroy_all_children();
    this.rows = results.map(
      (result, index) =>
        new ResultRow(
          result,
          getResultLabel(result, this.t),
          () => void this.listener?.onActivateAt(index),
        ),
    );
    this.rows.forEach((row) => this.resultsBox.add_child(row.actor));

    const hasResults = results.length > 0;
    const revealing = hasResults && !this.scrollView.visible;
    this.separator.visible = hasResults;
    this.scrollView.visible = hasResults;
    if (revealing) this.animateResultsIn();
    this.renderSelection(selectedIndex);
  }

  renderSelection(selectedIndex: number): void {
    this.rows.forEach((row, index) => row.setSelected(index === selectedIndex));

    const selected = this.rows[selectedIndex];
    if (selected) ensureActorVisibleInScrollView(this.scrollView, selected.actor);
  }

  setQueryText(text: string): void {
    this.entry.set_text(text);
    this.entry.clutter_text.set_cursor_position(-1);
  }

  private defaultHint(): string {
    return this.t("Search apps, windows, files or type a calculation");
  }

  private createBubble(spec: BubbleSpec): St.Button {
    const bubble = new St.Button({
      style_class: "launcher-bubble",
      child: new St.Icon({ style_class: "launcher-bubble-icon", icon_name: spec.icon }),
      accessible_name: spec.label(this.t),
      can_focus: false,
    });
    bubble.set_pivot_point(0.5, 0.5);
    bubble.connect("clicked", () => this.toggleMode(spec.mode));
    this.bubbles.set(spec.mode, bubble);
    return bubble;
  }

  private connectSignals(): void {
    this.entry.clutter_text.connect("text-changed", () => this.onTextChanged());
    this.entry.clutter_text.connect("activate", () => this.onActivate());
    this.entry.clutter_text.connect("key-press-event", (_actor, event: Clutter.Event) =>
      this.onKeyPress(event),
    );
    this.backdrop.connect("button-press-event", (_actor, event: Clutter.Event) =>
      this.onBackdropPress(event),
    );
    this.backdrop.connect("motion-event", () => {
      this.revealBubbles();
      return Clutter.EVENT_PROPAGATE;
    });
  }

  private onTextChanged(): void {
    const text = this.entry.get_text();
    if (this.mode === BrowseMode.APPS) this.renderApps(text);
    else if (this.mode === BrowseMode.FILES) void this.listener?.onQueryChanged(toFilesQuery(text));
    else void this.listener?.onQueryChanged(text);
  }

  private onActivate(): void {
    if (this.mode === BrowseMode.APPS) this.launchApp(this.appGrid.selected);
    else void this.listener?.onActivateSelected();
  }

  private onKeyPress(event: Clutter.Event): boolean {
    const symbol = event.get_key_symbol();

    if (this.onModeShortcut(event, symbol)) return Clutter.EVENT_STOP;
    if (symbol === Clutter.KEY_Escape) {
      this.onEscape();
      return Clutter.EVENT_STOP;
    }

    if (this.mode === BrowseMode.APPS) return this.onAppsKey(symbol);

    const action = KEY_ACTIONS.get(symbol);
    if (!action || !this.listener) return Clutter.EVENT_PROPAGATE;

    action(this.listener, this.entry.get_text());
    return Clutter.EVENT_STOP;
  }

  private onModeShortcut(event: Clutter.Event, symbol: number): boolean {
    if ((event.get_state() & Clutter.ModifierType.CONTROL_MASK) === 0) return false;

    const spec = BUBBLES.find((bubble) => bubble.key === symbol);
    if (!spec) return false;

    this.revealBubbles();
    this.toggleMode(spec.mode);
    return true;
  }

  private onAppsKey(symbol: number): boolean {
    const move = GRID_MOVES.get(symbol);
    if (move) {
      this.appGrid.move(move);
      this.renderAppSelection();
      return Clutter.EVENT_STOP;
    }

    if (ENTER_KEYS.has(symbol)) {
      this.launchApp(this.appGrid.selected);
      return Clutter.EVENT_STOP;
    }

    return Clutter.EVENT_PROPAGATE;
  }

  private onEscape(): void {
    const text = this.entry.get_text();
    if (this.mode && !text) {
      this.setMode(null);
      return;
    }

    if (this.mode === BrowseMode.APPS) {
      this.entry.set_text("");
      return;
    }

    this.listener?.onEscape(text);
  }

  private onBackdropPress(event: Clutter.Event): boolean {
    const target = global.stage.get_event_actor(event);
    if (target && (this.panel.contains(target) || this.bubbleBox.contains(target)))
      return Clutter.EVENT_PROPAGATE;

    this.close();
    return Clutter.EVENT_STOP;
  }

  private toggleMode(mode: BrowseMode): void {
    this.setMode(this.mode === mode ? null : mode);
  }

  private setMode(mode: BrowseMode | null): void {
    this.mode = mode;
    this.bubbles.forEach((bubble, key) => (bubble.checked = key === mode));

    const spec = BUBBLES.find((bubble) => bubble.mode === mode);
    this.entry.hint_text = spec ? spec.label(this.t) : this.defaultHint();
    this.entryIcon.icon_name = spec ? spec.icon : SEARCH_ICON;

    const showsApps = mode === BrowseMode.APPS;
    this.appScroll.visible = showsApps;
    if (showsApps) {
      this.listener?.reset();
      this.scrollView.visible = false;
      this.separator.visible = true;
      this.entry.set_text("");
      this.renderApps("");
      return;
    }

    this.entry.set_text("");
    this.appBox.destroy_all_children();
    this.tiles = [];
    if (mode === BrowseMode.FILES) void this.listener?.onQueryChanged(toFilesQuery(""));
    else this.listener?.reset();
  }

  private renderApps(query: string): void {
    this.appGrid.setItems(filterApps(this.apps.list(), query));
    this.appBox.destroy_all_children();
    this.tiles = [];

    const items = this.appGrid.entries;
    for (let start = 0; start < items.length; start += APP_COLUMNS) {
      const line = new St.BoxLayout({ style_class: "launcher-apps-row" });
      items.slice(start, start + APP_COLUMNS).forEach((app) => {
        const tile = this.createTile(app);
        this.tiles.push(tile);
        line.add_child(tile);
      });
      this.appBox.add_child(line);
    }

    this.renderAppSelection();
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
    tile.connect("clicked", () => this.launchApp(app));
    return tile;
  }

  private renderAppSelection(): void {
    this.tiles.forEach((tile, index) => {
      if (index === this.appGrid.selectedIndex) tile.add_style_pseudo_class("selected");
      else tile.remove_style_pseudo_class("selected");
    });

    const selected = this.tiles[this.appGrid.selectedIndex];
    if (selected) ensureActorVisibleInScrollView(this.appScroll, selected);
  }

  private launchApp(app: AppEntry | undefined): void {
    if (!app) return;

    this.close();
    this.apps.launch(app.id);
  }

  private applyPanelSurface(): void {
    applySurface(this.panel, PANEL_SURFACE_CLASSES);
  }

  private placeOnCurrentMonitor(): void {
    const monitor = Main.layoutManager.currentMonitor;
    if (!monitor) return;

    this.monitorConstraint.index = monitor.index;
    this.row.y = Math.round(monitor.height * TOP_OFFSET_RATIO);
  }

  private scheduleReveal(): void {
    this.cancelReveal();
    this.revealSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REVEAL_DELAY_MS, () => {
      this.revealSource = 0;
      this.revealBubbles();
      return GLib.SOURCE_REMOVE;
    });
  }

  private cancelReveal(): void {
    if (this.revealSource) GLib.source_remove(this.revealSource);
    this.revealSource = 0;
    this.hideBubbles();
  }

  private revealBubbles(): void {
    if (this.bubblesShown) return;

    this.bubblesShown = true;
    if (this.revealSource) GLib.source_remove(this.revealSource);
    this.revealSource = 0;

    [...this.bubbles.values()].forEach((bubble, index) => {
      bubble.reactive = true;
      bubble.ease({
        opacity: 255,
        scaleX: 1,
        scaleY: 1,
        translationX: 0,
        delay: index * BUBBLE_STAGGER_MS,
        duration: BUBBLE_ANIMATION_MS,
        mode: Clutter.AnimationMode.EASE_OUT_BACK,
      });
    });
  }

  private hideBubbles(): void {
    this.bubblesShown = false;
    this.bubbles.forEach((bubble) => {
      bubble.remove_all_transitions();
      bubble.set({
        opacity: 0,
        scaleX: BUBBLE_START_SCALE,
        scaleY: BUBBLE_START_SCALE,
        translationX: -BUBBLE_TRAVEL_PX,
        reactive: false,
      });
    });
  }

  private animateIn(): void {
    this.panel.remove_all_transitions();
    this.panel.set_pivot_point(0.5, 0.2);
    this.panel.set({ opacity: 0, scaleX: OPEN_START_SCALE, scaleY: OPEN_START_SCALE });
    this.panel.ease({
      scaleX: 1,
      scaleY: 1,
      duration: OPEN_ANIMATION_MS,
      mode: Clutter.AnimationMode.EASE_OUT_BACK,
    });
    this.panel.ease({
      opacity: 255,
      duration: FADE_ANIMATION_MS,
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });
  }

  private animateResultsIn(): void {
    this.scrollView.remove_all_transitions();
    this.scrollView.set({ opacity: 0, translationY: -RESULTS_SLIDE_PX });
    this.scrollView.ease({
      opacity: 255,
      translationY: 0,
      duration: FADE_ANIMATION_MS,
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });
  }
}
