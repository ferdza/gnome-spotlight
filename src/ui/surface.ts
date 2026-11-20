import type St from "gi://St";

import { PanelSurface, resolvePanelSurface } from "@domain/appearance/panelSurface";
import { hasBlurMyShell } from "@infra/gnome/blurProvider";

export const BLUR_TARGET_CLASS = "clipboard-dialog";
export const ENTRY_INLINE_STYLE = "background-color: transparent; box-shadow: none; border: none;";

export const applySurface = (actor: St.Widget, classes: Record<PanelSurface, string>): void => {
  Object.values(classes).forEach((name) => actor.remove_style_class_name(name));
  actor.add_style_class_name(classes[resolvePanelSurface({ hasBlurProvider: hasBlurMyShell() })]);
};
