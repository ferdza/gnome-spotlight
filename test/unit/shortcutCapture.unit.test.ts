/**
 * Captura do atalho nas preferências: o que fazer com cada combinação pressionada.
 * Letra sem modificador não vale (sequestraria a digitação); tecla de função sozinha vale.
 */
import { describe, expect, test } from "bun:test";

import {
  classifyShortcutPress,
  describeHardwareAccelerator,
  hardwareAccelerator,
  ShortcutCapture,
  type ShortcutPress,
  usesHardwareKey,
} from "@domain/keybinding/shortcutCapture";

const press = (
  keyName: string,
  modifiers: Partial<Omit<ShortcutPress, "keyName">> = {},
): ShortcutPress => ({
  keyName,
  hasSuper: false,
  hasControl: false,
  hasAlt: false,
  hasShift: false,
  ...modifiers,
});

describe("classifyShortcutPress", () => {
  test("Esc sozinho cancela a captura", () => {
    expect(classifyShortcutPress(press("Escape"))).toBe(ShortcutCapture.CANCEL);
  });

  test("Backspace sozinho desativa o atalho", () => {
    expect(classifyShortcutPress(press("BackSpace"))).toBe(ShortcutCapture.CLEAR);
  });

  test.each([["Super_L"], ["Control_R"], ["Alt_L"], ["Shift_L"], ["ISO_Level3_Shift"]])(
    "%p sozinho ainda está incompleto",
    (keyName) => {
      expect(classifyShortcutPress(press(keyName, { hasSuper: true }))).toBe(
        ShortcutCapture.INCOMPLETE,
      );
    },
  );

  test.each([["a"], ["space"], ["Return"]])("%p sem modificador é recusado", (keyName) => {
    expect(classifyShortcutPress(press(keyName))).toBe(ShortcutCapture.INVALID);
  });

  test("Shift sozinho com letra é recusado (é só uma maiúscula)", () => {
    expect(classifyShortcutPress(press("a", { hasShift: true }))).toBe(ShortcutCapture.INVALID);
  });

  test.each([
    [press("space", { hasSuper: true })],
    [press("k", { hasControl: true, hasAlt: true })],
    [press("Escape", { hasSuper: true })],
    [press("F12")],
    [press("F5", { hasShift: true })],
    [press("F23", { hasSuper: true, hasShift: true })],
    [press("XF86Assistant")],
    [press("XF86AudioMicMute")],
  ])("combinação válida é aceita", (input) => {
    expect(classifyShortcutPress(input)).toBe(ShortcutCapture.ACCEPT);
  });
});

describe("teclas sem nome estável (como a tecla Copilot)", () => {
  test.each([
    ["XF86Assistant", true],
    ["XF86AudioMicMute", true],
    ["", true],
    ["F23", false],
    ["space", false],
  ])("%p usa o código da tecla: %s", (keyName, expected) => {
    expect(usesHardwareKey(keyName)).toBe(expected);
  });

  test("o atalho leva os modificadores e o código em hexadecimal", () => {
    expect(
      hardwareAccelerator(press("XF86Assistant", { hasSuper: true, hasShift: true }), 201),
    ).toBe("<Shift><Super>0xc9");
    expect(hardwareAccelerator(press("XF86Assistant"), 201)).toBe("0xc9");
  });

  test("descreve o atalho por código para mostrar nas preferências", () => {
    expect(describeHardwareAccelerator("<Shift><Super>0xc9")).toBe("Shift + Super + 0xc9");
    expect(describeHardwareAccelerator("0xc9")).toBe("0xc9");
  });

  test.each([["<Super>space"], [""], ["<Control><Alt>k"]])(
    "%p não é atalho por código",
    (value) => {
      expect(describeHardwareAccelerator(value)).toBeNull();
    },
  );
});
