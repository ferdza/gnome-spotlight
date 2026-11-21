import Clutter from "gi://Clutter";
import Pango from "gi://Pango";
import St from "gi://St";

import { SPRING_SNAPPY } from "@domain/animation/spring";
import type { SearchResult } from "@domain/search/searchResult";
import { springTo } from "@ui/motion";
import { toIconProps } from "@ui/searchIconProps";

const SELECTED = "selected";
const PRESS_SCALE = 0.98;

const createEllipsizedLabel = (text: string, styleClass: string): St.Label => {
  const label = new St.Label({ text, style_class: styleClass, x_align: Clutter.ActorAlign.START });
  label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
  return label;
};

export class ResultRow {
  readonly actor: St.Button;

  constructor(result: SearchResult, kindLabel: string, onClick: () => void) {
    const texts = new St.BoxLayout({
      orientation: Clutter.Orientation.VERTICAL,
      x_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
    });
    texts.add_child(createEllipsizedLabel(result.title, "launcher-result-title"));
    if (result.subtitle)
      texts.add_child(createEllipsizedLabel(result.subtitle, "launcher-result-subtitle"));

    const row = new St.BoxLayout({ style_class: "launcher-result-row", x_expand: true });
    row.add_child(
      new St.Icon({ style_class: "launcher-result-icon", ...toIconProps(result.icon) }),
    );
    row.add_child(texts);
    row.add_child(
      new St.Label({
        text: kindLabel,
        style_class: "launcher-result-kind",
        y_align: Clutter.ActorAlign.CENTER,
      }),
    );

    this.actor = new St.Button({
      style_class: "launcher-result",
      child: row,
      x_expand: true,
      can_focus: false,
      accessible_name: result.title,
    });
    this.actor.set_pivot_point(0.5, 0.5);
    this.actor.connect("clicked", onClick);
    this.actor.connect("notify::pressed", () => {
      const scale = this.actor.pressed ? PRESS_SCALE : 1;
      springTo(this.actor, { scale_x: scale, scale_y: scale }, { spring: SPRING_SNAPPY });
    });
  }

  setSelected(isSelected: boolean): void {
    if (isSelected) {
      this.actor.add_style_pseudo_class(SELECTED);
      return;
    }

    this.actor.remove_style_pseudo_class(SELECTED);
  }
}
