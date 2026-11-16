/**
 * The shortcut closes search in modal mode without opening it over another system dialog.
 */
import { describe, expect, test } from "bun:test";

import { toggleShortcut } from "@app/shortcutToggle";

describe("shouldToggleShortcut", () => {
  test.each([
    [false, false, true],
    [false, true, true],
    [true, true, true],
    [true, false, false],
  ])("modal=%s, search open=%s allows toggling: %s", (modal, open, allowed) => {
    expect(toggleShortcut(modal, open)).toBe(allowed);
  });
});
