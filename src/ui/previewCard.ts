import Clutter from "gi://Clutter";
import Pango from "gi://Pango";
import St from "gi://St";

import { SPRING_BOUNCY } from "@domain/animation/spring";
import type { FilePreview } from "@domain/files/filePorts";
import { springTo, stopMotion } from "@ui/motion";
import { toIconProps } from "@ui/searchIconProps";

const START_SCALE = 0.92;
const FADE_MS = 140;
const TEXT_LIMIT = 1200;

export class PreviewCard {
  readonly actor: St.BoxLayout;
  private readonly icon: St.Icon;
  private readonly title: St.Label;
  private readonly details: St.Label;
  private readonly path: St.Label;
  private readonly body: St.Label;

  constructor(surfaceClasses: string) {
    this.icon = new St.Icon({
      style_class: "launcher-preview-icon",
      x_align: Clutter.ActorAlign.CENTER,
    });
    this.title = new St.Label({ style_class: "launcher-preview-title" });
    this.title.clutter_text.ellipsize = Pango.EllipsizeMode.MIDDLE;
    this.details = new St.Label({ style_class: "launcher-preview-details" });
    this.path = new St.Label({ style_class: "launcher-preview-path" });
    this.path.clutter_text.ellipsize = Pango.EllipsizeMode.MIDDLE;
    this.body = new St.Label({ style_class: "launcher-preview-text" });
    this.body.clutter_text.line_wrap = true;
    this.body.clutter_text.ellipsize = Pango.EllipsizeMode.END;

    this.actor = new St.BoxLayout({
      style_class: `launcher-preview ${surfaceClasses}`,
      orientation: Clutter.Orientation.VERTICAL,
      reactive: true,
      visible: false,
    });
    [this.icon, this.title, this.details, this.path, this.body].forEach((child) =>
      this.actor.add_child(child),
    );
    this.actor.set_pivot_point(0.5, 0.5);
  }

  get isVisible(): boolean {
    return this.actor.visible;
  }

  showFile(preview: FilePreview): void {
    this.icon.set(toIconProps(preview.icon));
    this.icon.visible = true;
    this.title.text = preview.title;
    this.details.text = preview.details.join(" · ");
    this.details.visible = preview.details.length > 0;
    this.path.text = preview.path;
    this.path.visible = true;
    this.body.visible = false;
    this.reveal();
  }

  showText(title: string, text: string): void {
    this.icon.visible = false;
    this.title.text = title;
    this.details.visible = false;
    this.path.visible = false;
    this.body.text = text.slice(0, TEXT_LIMIT);
    this.body.visible = true;
    this.reveal();
  }

  hide(): void {
    stopMotion(this.actor);
    this.actor.remove_all_transitions();
    this.actor.visible = false;
  }

  private reveal(): void {
    if (this.actor.visible) return;

    stopMotion(this.actor);
    this.actor.set({ visible: true, opacity: 0, scale_x: START_SCALE, scale_y: START_SCALE });
    springTo(this.actor, { scale_x: 1, scale_y: 1 }, { spring: SPRING_BOUNCY });
    this.actor.ease({
      opacity: 255,
      duration: FADE_MS,
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });
  }
}
