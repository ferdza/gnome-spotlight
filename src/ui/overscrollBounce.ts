import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import type St from "gi://St";

import { SPRING_BOUNCY } from "@domain/animation/spring";
import { springTo, stopMotion } from "@ui/motion";

const MAX_PULL_PX = 64;
const WHEEL_PULL_PX = 14;
const SMOOTH_PULL_PX = 6;
const RELEASE_DELAY_MS = 90;
const EDGE_TOLERANCE_PX = 0.5;

export class OverscrollBounce {
  private releaseSource = 0;

  constructor(
    private readonly scroll: St.ScrollView,
    private readonly content: Clutter.Actor,
  ) {
    scroll.connect("scroll-event", (_actor, event: Clutter.Event) => this.onScroll(event));
    const horizontal = scroll.hadjustment;
    horizontal.connect("notify::value", () => {
      if (horizontal.value !== 0) horizontal.set_value(0);
    });
  }

  dispose(): void {
    this.cancelRelease();
    stopMotion(this.content);
    this.content.translation_y = 0;
  }

  private onScroll(event: Clutter.Event): boolean {
    if (this.isHorizontal(event)) return Clutter.EVENT_STOP;

    const delta = this.deltaOf(event);
    if (delta === 0) return Clutter.EVENT_PROPAGATE;

    const adjustment = this.scroll.vadjustment;
    const atTop = adjustment.value <= adjustment.lower + EDGE_TOLERANCE_PX;
    const atBottom =
      adjustment.value >= adjustment.upper - adjustment.page_size - EDGE_TOLERANCE_PX;
    const pullsPastEdge = (delta < 0 && atTop) || (delta > 0 && atBottom);
    if (!pullsPastEdge) {
      this.release();
      return Clutter.EVENT_PROPAGATE;
    }

    stopMotion(this.content);
    const current = this.content.translation_y;
    const resistance = 1 - Math.min(Math.abs(current) / MAX_PULL_PX, 1);
    this.content.translation_y = Math.min(
      Math.max(current - delta * resistance, -MAX_PULL_PX),
      MAX_PULL_PX,
    );
    this.scheduleRelease();
    return Clutter.EVENT_STOP;
  }

  private isHorizontal(event: Clutter.Event): boolean {
    const direction = event.get_scroll_direction();
    if (direction === Clutter.ScrollDirection.LEFT || direction === Clutter.ScrollDirection.RIGHT)
      return true;
    if (direction !== Clutter.ScrollDirection.SMOOTH) return false;

    const [dx, dy] = event.get_scroll_delta();
    return Math.abs(dx) > Math.abs(dy);
  }

  private deltaOf(event: Clutter.Event): number {
    switch (event.get_scroll_direction()) {
      case Clutter.ScrollDirection.UP:
        return -WHEEL_PULL_PX;
      case Clutter.ScrollDirection.DOWN:
        return WHEEL_PULL_PX;
      case Clutter.ScrollDirection.SMOOTH:
        return event.get_scroll_delta()[1] * SMOOTH_PULL_PX;
      default:
        return 0;
    }
  }

  private scheduleRelease(): void {
    this.cancelRelease();
    this.releaseSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RELEASE_DELAY_MS, () => {
      this.releaseSource = 0;
      this.release();
      return GLib.SOURCE_REMOVE;
    });
  }

  private release(): void {
    this.cancelRelease();
    if (this.content.translation_y === 0) return;

    springTo(this.content, { translation_y: 0 }, { spring: SPRING_BOUNCY });
  }

  private cancelRelease(): void {
    if (this.releaseSource) GLib.source_remove(this.releaseSource);
    this.releaseSource = 0;
  }
}
