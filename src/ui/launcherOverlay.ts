import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import Pango from "gi://Pango";
import Shell from "gi://Shell";
import St from "gi://St";
import { ensureActorVisibleInScrollView } from "resource:///org/gnome/shell/misc/animationUtils.js";
import { MonitorConstraint } from "resource:///org/gnome/shell/ui/layout.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import {
  SPRING_BOUNCY,
  SPRING_DEFAULT,
  SPRING_SMOOTH,
  SPRING_SNAPPY,
} from "@domain/animation/spring";
import { PanelSurface } from "@domain/appearance/panelSurface";
import { AppGrid, filterApps, GridMove } from "@domain/apps/appGrid";
import type { AppCatalog, AppEntry, PinnedApps } from "@domain/apps/appPorts";
import { orderPinnedFirst } from "@domain/apps/pinning";
import type { FilePreviewReader } from "@domain/files/filePorts";
import { BrowseMode, toBrowseQuery } from "@domain/query/browseQuery";
import { getResultLabel } from "@domain/search/resultKindLabel";
import type { SearchResult } from "@domain/search/searchResult";
import type { Translate } from "@i18n/translate";
import type { LauncherPresenter, LauncherView } from "@ui/launcherPresenter";
import { springTo, stopMotion } from "@ui/motion";
import { OverscrollBounce } from "@ui/overscrollBounce";
import { PreviewCard } from "@ui/previewCard";
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
  | "selectedResult"
  | "reset"
>;

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
  {
    mode: BrowseMode.ACTIONS,
    icon: "system-run-symbolic",
    key: Clutter.KEY_3,
    label: (t) => t("Actions"),
  },
  {
    mode: BrowseMode.CLIPBOARD,
    icon: "edit-paste-symbolic",
    key: Clutter.KEY_4,
    label: (t) => t("Clipboard"),
  },
];

const PREVIEW_TOP_PX = 96;
const SEARCH_ICON = "edit-find-symbolic";
const APP_COLUMNS = 6;
const TOTAL_WIDTH = 820;
const TOP_OFFSET_RATIO = 0.25;
const OPEN_START_SCALE = 0.9;
const OPEN_RISE_PX = 14;
const CLOSE_END_SCALE = 0.965;
const CLOSE_MS = 130;
const FADE_MS = 160;
const RESULTS_SLIDE_PX = 10;
const MIN_HEIGHT_CHANGE_PX = 4;
const REVEAL_DELAY_MS = 650;
const BUBBLE_SIZE = 52;
const BUBBLE_GAP = 10;
const BUBBLE_PANEL_GAP = 12;
const BUBBLE_STAGGER_MS = 60;
const BUBBLE_START_SCALE = 0.35;
const BUBBLE_HOVER_SCALE = 1.08;
const COLLAPSE_MS = 150;
const COLLAPSE_STAGGER_MS = 35;
const BUBBLE_FIRST_DELAY_MS = 90;
const PRESS_SCALE = 0.93;
const SELECTED_TILE_SCALE = 1.05;
const TILE_START_SCALE = 0.82;
const TILE_STAGGER_MS = 14;
const TILE_STAGGER_LIMIT = 25;

const bubbleStripWidth = (count: number): number => count * BUBBLE_SIZE + (count - 1) * BUBBLE_GAP;

const panelWidthWithBubbles = (count: number): number =>
  TOTAL_WIDTH - bubbleStripWidth(count) - BUBBLE_PANEL_GAP;

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
  private readonly row: St.Widget;
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
  private readonly slots: { readonly slot: St.BoxLayout; readonly bubble: St.Button }[] = [];
  private readonly previewCard = new PreviewCard(BLUR_TARGET_CLASS);
  private previewToken = 0;
  private readonly appGrid = new AppGrid(APP_COLUMNS);
  private rows: ResultRow[] = [];
  private tiles: St.Button[] = [];
  private mode: BrowseMode | null = null;
  private bubblesShown = false;
  private revealSource = 0;
  private quiet = false;
  private readonly overscrolls: OverscrollBounce[] = [];
  private grab: Clutter.Grab | null = null;
  private listener: LauncherListener | null = null;

  constructor(
    private readonly t: Translate,
    private readonly apps: AppCatalog,
    private readonly pins: PinnedApps,
    private readonly previews: FilePreviewReader,
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
      clip_to_allocation: true,
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
      clip_to_allocation: true,
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

    this.panel.set_width(TOTAL_WIDTH);
    this.bubbleBox.set_position(TOTAL_WIDTH - bubbleStripWidth(BUBBLES.length), 0);
    this.row = new St.Widget({ width: TOTAL_WIDTH });
    this.row.add_child(this.panel);
    this.row.add_child(this.bubbleBox);

    this.backdrop = new St.Widget({ reactive: true });
    this.monitorConstraint = new MonitorConstraint({});
    this.backdrop.add_constraint(this.monitorConstraint);
    this.backdrop.add_child(this.row);
    this.backdrop.add_child(this.previewCard.actor);
    this.previewCard.actor.add_constraint(
      new Clutter.AlignConstraint({
        source: this.backdrop,
        align_axis: Clutter.AlignAxis.X_AXIS,
        factor: 0.5,
      }),
    );
    this.row.add_constraint(
      new Clutter.AlignConstraint({
        source: this.backdrop,
        align_axis: Clutter.AlignAxis.X_AXIS,
        factor: 0.5,
      }),
    );

    this.overscrolls.push(
      new OverscrollBounce(this.scrollView, this.resultsBox),
      new OverscrollBounce(this.appScroll, this.appBox),
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

    this.backdrop.remove_all_transitions();
    this.backdrop.get_parent()?.remove_child(this.backdrop);
    this.backdrop.opacity = 255;

    this.placeOnCurrentMonitor();
    this.applyPanelSurface();
    Main.layoutManager.modalDialogGroup.add_child(this.backdrop);

    this.grab = Main.pushModal(this.backdrop, { actionMode: Shell.ActionMode.SYSTEM_MODAL });
    this.resetView();
    this.listener?.reset();
    void this.listener?.onQueryChanged("");
    this.entry.grab_key_focus();
    this.animateIn();
    this.scheduleReveal();
  }

  close(): void {
    if (!this.grab) return;

    this.cancelTimers();
    this.hidePreview();
    Main.popModal(this.grab);
    this.grab = null;
    this.animateOut();
  }

  destroy(): void {
    this.listener?.reset();
    this.listener = null;
    this.cancelTimers();
    if (this.grab) {
      Main.popModal(this.grab);
      this.grab = null;
    }
    this.overscrolls.forEach((overscroll) => overscroll.dispose());
    this.backdrop.destroy();
  }

  renderResults(results: readonly SearchResult[], selectedIndex: number): void {
    if (this.mode === BrowseMode.APPS) return;

    const previousHeight = this.scrollView.visible ? this.scrollView.get_height() : 0;
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
    if (hasResults) this.animateHeight(this.scrollView, previousHeight);
    this.renderSelection(selectedIndex);
  }

  renderSelection(selectedIndex: number): void {
    this.rows.forEach((row, index) => row.setSelected(index === selectedIndex));

    const selected = this.rows[selectedIndex];
    if (selected) ensureActorVisibleInScrollView(this.scrollView, selected.actor);
    if (this.previewCard.isVisible) void this.showPreview();
  }

  setQueryText(text: string): void {
    this.entry.set_text(text);
    this.entry.clutter_text.set_cursor_position(-1);
  }

  private defaultHint(): string {
    return this.t("Search apps, windows, files or type a calculation");
  }

  private createBubble(spec: BubbleSpec): St.BoxLayout {
    const bubble = new St.Button({
      style_class: "launcher-bubble",
      child: new St.Icon({ style_class: "launcher-bubble-icon", icon_name: spec.icon }),
      accessible_name: spec.label(this.t),
      can_focus: false,
    });
    bubble.set_pivot_point(0.5, 0.5);
    bubble.connect("clicked", () => this.toggleMode(spec.mode));
    const settle = (): void => {
      if (!bubble.reactive) return;
      const scale = bubble.pressed ? PRESS_SCALE : bubble.hover ? BUBBLE_HOVER_SCALE : 1;
      springTo(bubble, { scale_x: scale, scale_y: scale }, { spring: SPRING_SNAPPY });
    };
    bubble.connect("notify::pressed", settle);
    bubble.connect("notify::hover", settle);
    this.bubbles.set(spec.mode, bubble);

    const hint = new St.Label({
      text: `Ctrl ${BUBBLES.indexOf(spec) + 1}`,
      style_class: "launcher-bubble-hint",
      x_align: Clutter.ActorAlign.CENTER,
    });
    const slot = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL });
    slot.add_child(bubble);
    slot.add_child(hint);
    slot.set_pivot_point(0.5, 0.5);
    this.slots.push({ slot, bubble });
    return slot;
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
    if (this.quiet) return;

    const text = this.entry.get_text();
    if (this.mode === BrowseMode.APPS) this.renderApps(text);
    else if (this.mode) void this.listener?.onQueryChanged(toBrowseQuery(this.mode, text));
    else void this.listener?.onQueryChanged(text);
  }

  private onActivate(): void {
    if (this.mode === BrowseMode.APPS) this.launchApp(this.appGrid.selected);
    else void this.listener?.onActivateSelected();
  }

  private onKeyPress(event: Clutter.Event): boolean {
    const symbol = event.get_key_symbol();

    if (this.onModeShortcut(event, symbol)) return Clutter.EVENT_STOP;
    if (this.onControlShortcut(event, symbol)) return Clutter.EVENT_STOP;
    if (symbol === Clutter.KEY_Escape) {
      this.onEscape();
      return Clutter.EVENT_STOP;
    }

    if (symbol === Clutter.KEY_BackSpace && this.mode && !this.entry.get_text()) {
      this.leaveMode();
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

    this.toggleMode(spec.mode);
    return true;
  }

  private onControlShortcut(event: Clutter.Event, symbol: number): boolean {
    if ((event.get_state() & Clutter.ModifierType.CONTROL_MASK) === 0) return false;

    if (symbol === Clutter.KEY_y || symbol === Clutter.KEY_Y) {
      this.togglePreview();
      return true;
    }

    if (this.mode === BrowseMode.APPS && (symbol === Clutter.KEY_p || symbol === Clutter.KEY_P)) {
      this.togglePin(this.appGrid.selected);
      return true;
    }

    return false;
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
    if (this.previewCard.isVisible) {
      this.hidePreview();
      return;
    }

    if (this.mode && !text) {
      this.leaveMode();
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
    if (
      target &&
      (this.panel.contains(target) ||
        this.bubbleBox.contains(target) ||
        this.previewCard.actor.contains(target))
    )
      return Clutter.EVENT_PROPAGATE;

    this.close();
    return Clutter.EVENT_STOP;
  }

  private toggleMode(mode: BrowseMode): void {
    if (this.mode === mode) this.leaveMode();
    else this.enterMode(mode);
  }

  private applyMode(mode: BrowseMode | null): void {
    this.mode = mode;
    this.bubbles.forEach((bubble, key) => (bubble.checked = key === mode));

    const spec = BUBBLES.find((bubble) => bubble.mode === mode);
    this.entry.hint_text = spec ? spec.label(this.t) : this.defaultHint();
    this.entryIcon.icon_name = spec ? spec.icon : SEARCH_ICON;
    this.setTextSilently("");
  }

  private setTextSilently(text: string): void {
    this.quiet = true;
    this.entry.set_text(text);
    this.quiet = false;
  }

  private resetView(): void {
    this.hidePreview();
    this.applyMode(null);
    this.appScroll.visible = false;
    this.appScroll.set_height(-1);
    this.scrollView.visible = false;
    this.scrollView.set_height(-1);
    this.separator.visible = false;
    this.hideBubbles();
  }

  private enterMode(mode: BrowseMode): void {
    this.hidePreview();
    this.applyMode(mode);
    this.collapseBubbles();

    if (mode === BrowseMode.APPS) {
      this.showApps();
      return;
    }

    this.hideApps();
    void this.listener?.onQueryChanged(toBrowseQuery(mode, ""));
  }

  private leaveMode(): void {
    this.hidePreview();
    this.applyMode(null);
    this.hideApps();
    this.listener?.reset();
    void this.listener?.onQueryChanged("");
    this.revealBubbles();
  }

  private showApps(): void {
    const previousHeight = this.scrollView.visible ? this.scrollView.get_height() : 0;
    this.listener?.reset();
    this.scrollView.visible = false;
    this.separator.visible = true;
    this.appScroll.visible = true;
    this.renderApps("", true);
    this.animateHeight(this.appScroll, previousHeight);
  }

  private hideApps(): void {
    if (!this.appScroll.visible) return;

    springTo(
      this.appScroll,
      { height: 0 },
      {
        spring: SPRING_SMOOTH,
        onComplete: () => {
          if (this.mode === BrowseMode.APPS) return;
          this.appScroll.visible = false;
          this.appScroll.set_height(-1);
          this.appBox.destroy_all_children();
          this.tiles = [];
        },
      },
    );
  }

  private renderApps(query: string, entrance = false, keepId?: string): void {
    const previousHeight = this.appScroll.get_height();
    const matches = filterApps(this.apps.list(), query);
    this.appGrid.setItems(query.trim() ? matches : orderPinnedFirst(matches, this.pins.list()));
    if (keepId) this.appGrid.select(this.appGrid.entries.findIndex((app) => app.id === keepId));
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
    if (entrance) this.animateTilesIn();
    else this.animateHeight(this.appScroll, previousHeight);
  }

  private animateTilesIn(): void {
    this.tiles.slice(0, TILE_STAGGER_LIMIT).forEach((tile, index) => {
      const rest = this.restScale(tile);
      stopMotion(tile);
      tile.set({ opacity: 0, scale_x: TILE_START_SCALE, scale_y: TILE_START_SCALE });
      const delay = index * TILE_STAGGER_MS;
      springTo(tile, { scale_x: rest, scale_y: rest }, { spring: SPRING_BOUNCY, delay });
      tile.ease({
        opacity: 255,
        duration: FADE_MS,
        delay,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      });
    });
  }

  private restScale(tile: St.Button): number {
    return tile.has_style_pseudo_class("selected") ? SELECTED_TILE_SCALE : 1;
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

    const caption = new St.BoxLayout({ x_align: Clutter.ActorAlign.CENTER });
    if (this.pins.list().includes(app.id))
      caption.add_child(
        new St.Icon({ style_class: "launcher-tile-pin", icon_name: "view-pin-symbolic" }),
      );
    caption.add_child(label);
    box.add_child(caption);

    const tile = new St.Button({
      style_class: "launcher-tile",
      child: box,
      can_focus: false,
      accessible_name: app.name,
      button_mask: St.ButtonMask.ONE | St.ButtonMask.THREE,
    });
    tile.set_pivot_point(0.5, 0.5);
    tile.connect("clicked", (_button: St.Button, mouseButton: number) => {
      if (mouseButton === Clutter.BUTTON_SECONDARY) this.togglePin(app);
      else this.launchApp(app);
    });
    tile.connect("notify::pressed", () => {
      const scale = tile.pressed ? PRESS_SCALE : this.restScale(tile);
      springTo(tile, { scale_x: scale, scale_y: scale }, { spring: SPRING_SNAPPY });
    });
    return tile;
  }

  private renderAppSelection(): void {
    this.tiles.forEach((tile, index) => {
      const wasSelected = tile.has_style_pseudo_class("selected");
      const isSelected = index === this.appGrid.selectedIndex;
      if (wasSelected === isSelected) return;

      if (isSelected) tile.add_style_pseudo_class("selected");
      else tile.remove_style_pseudo_class("selected");
      const scale = this.restScale(tile);
      springTo(tile, { scale_x: scale, scale_y: scale }, { spring: SPRING_SNAPPY });
    });

    const selected = this.tiles[this.appGrid.selectedIndex];
    if (selected) ensureActorVisibleInScrollView(this.appScroll, selected);
  }

  private launchApp(app: AppEntry | undefined): void {
    if (!app) return;

    this.close();
    this.apps.launch(app.id);
  }

  private togglePreview(): void {
    if (this.previewCard.isVisible) this.hidePreview();
    else void this.showPreview();
  }

  private hidePreview(): void {
    this.previewToken += 1;
    this.previewCard.hide();
  }

  private async showPreview(): Promise<void> {
    if (this.mode === BrowseMode.APPS) return;

    const result = this.listener?.selectedResult();
    const preview = result?.preview;
    if (!result || !preview) {
      this.hidePreview();
      return;
    }

    const token = ++this.previewToken;
    if (preview.kind === "text") {
      this.previewCard.showText(result.title, preview.text);
      return;
    }

    const file = await this.previews.describe(preview.path);
    if (token !== this.previewToken || !this.isOpen) return;
    if (file) this.previewCard.showFile(file);
    else this.hidePreview();
  }

  private togglePin(app: AppEntry | undefined): void {
    if (!app) return;

    this.pins.toggle(app.id);
    this.renderApps(this.entry.get_text(), false, app.id);
  }

  private applyPanelSurface(): void {
    applySurface(this.panel, PANEL_SURFACE_CLASSES);
    applySurface(this.previewCard.actor, PANEL_SURFACE_CLASSES);
  }

  private placeOnCurrentMonitor(): void {
    const monitor = Main.layoutManager.currentMonitor;
    if (!monitor) return;

    this.monitorConstraint.index = monitor.index;
    this.row.y = Math.round(monitor.height * TOP_OFFSET_RATIO);
    this.previewCard.actor.y = this.row.y + PREVIEW_TOP_PX;
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
  }

  private cancelTimers(): void {
    this.cancelReveal();
  }

  private revealBubbles(): void {
    if (this.bubblesShown || this.mode) return;

    this.bubblesShown = true;
    this.cancelTimers();

    springTo(
      this.panel,
      { width: panelWidthWithBubbles(BUBBLES.length) },
      { spring: SPRING_DEFAULT },
    );

    this.slots.forEach(({ slot, bubble }, index) => {
      const delay = BUBBLE_FIRST_DELAY_MS + index * BUBBLE_STAGGER_MS;
      stopMotion(slot);
      bubble.reactive = true;
      slot.set({ opacity: 0, scale_x: BUBBLE_START_SCALE, scale_y: BUBBLE_START_SCALE });
      springTo(slot, { scale_x: 1, scale_y: 1 }, { spring: SPRING_BOUNCY, delay });
      slot.ease({
        opacity: 255,
        duration: FADE_MS,
        delay,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      });
    });
  }

  private collapseBubbles(): void {
    if (!this.bubblesShown) return;

    this.bubblesShown = false;
    this.cancelTimers();

    springTo(this.panel, { width: TOTAL_WIDTH }, { spring: SPRING_DEFAULT });

    this.slots.forEach(({ slot, bubble }, index) => {
      bubble.reactive = false;
      const delay = (this.slots.length - 1 - index) * COLLAPSE_STAGGER_MS;
      springTo(
        slot,
        { scale_x: BUBBLE_START_SCALE, scale_y: BUBBLE_START_SCALE },
        { spring: SPRING_SMOOTH, delay },
      );
      slot.ease({
        opacity: 0,
        duration: COLLAPSE_MS,
        delay,
        mode: Clutter.AnimationMode.EASE_IN_QUAD,
      });
    });
  }

  private hideBubbles(): void {
    this.bubblesShown = false;
    this.cancelTimers();
    stopMotion(this.panel, ["width"]);
    this.panel.set_width(TOTAL_WIDTH);
    this.slots.forEach(({ slot, bubble }) => {
      stopMotion(slot);
      slot.remove_all_transitions();
      slot.set({ opacity: 0, scale_x: BUBBLE_START_SCALE, scale_y: BUBBLE_START_SCALE });
      bubble.reactive = false;
    });
  }

  private animateHeight(actor: St.ScrollView, from: number): void {
    stopMotion(actor, ["height"]);
    actor.set_height(-1);
    const natural = actor.get_preferred_height(-1)[1];
    if (Math.abs(natural - from) < MIN_HEIGHT_CHANGE_PX) return;

    actor.set_height(from);
    springTo(
      actor,
      { height: natural },
      { spring: SPRING_DEFAULT, onComplete: () => actor.set_height(-1) },
    );
  }

  private animateIn(): void {
    stopMotion(this.panel);
    this.panel.remove_all_transitions();
    this.panel.set_pivot_point(0.5, 0.2);
    this.panel.set({
      opacity: 0,
      scale_x: OPEN_START_SCALE,
      scale_y: OPEN_START_SCALE,
      translation_y: -OPEN_RISE_PX,
    });
    springTo(this.panel, { scale_x: 1, scale_y: 1, translation_y: 0 }, { spring: SPRING_BOUNCY });
    this.panel.ease({
      opacity: 255,
      duration: FADE_MS,
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });
  }

  private animateOut(): void {
    springTo(
      this.panel,
      { scale_x: CLOSE_END_SCALE, scale_y: CLOSE_END_SCALE },
      { spring: SPRING_SMOOTH },
    );
    this.backdrop.ease({
      opacity: 0,
      duration: CLOSE_MS,
      mode: Clutter.AnimationMode.EASE_IN_QUAD,
      onComplete: () => {
        if (!this.grab) this.backdrop.get_parent()?.remove_child(this.backdrop);
      },
    });
  }

  private animateResultsIn(): void {
    stopMotion(this.scrollView, ["translation_y"]);
    this.scrollView.remove_all_transitions();
    this.scrollView.set({ opacity: 0, translation_y: -RESULTS_SLIDE_PX });
    springTo(this.scrollView, { translation_y: 0 }, { spring: SPRING_SNAPPY });
    this.scrollView.ease({
      opacity: 255,
      duration: FADE_MS,
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });
  }
}
