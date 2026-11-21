export const ShortcutCapture = {
  CANCEL: "cancel",
  CLEAR: "clear",
  INCOMPLETE: "incomplete",
  INVALID: "invalid",
  ACCEPT: "accept",
} as const;
export type ShortcutCapture = (typeof ShortcutCapture)[keyof typeof ShortcutCapture];

export interface ShortcutPress {
  readonly keyName: string;
  readonly hasSuper: boolean;
  readonly hasControl: boolean;
  readonly hasAlt: boolean;
  readonly hasShift: boolean;
}

type CaptureRule = (press: ShortcutPress) => ShortcutCapture | null;

const MODIFIER_KEY =
  /^(Super|Control|Alt|Shift|Meta|Hyper)_[LR]$|^ISO_Level\d_(Shift|Latch|Lock)$|^Caps_Lock$/;
const FUNCTION_KEY = /^F\d{1,2}$/;
const SPECIAL_KEY = /^XF86\w+$/;

const hasCommandModifier = (press: ShortcutPress): boolean =>
  press.hasSuper || press.hasControl || press.hasAlt;

const isBare = (press: ShortcutPress): boolean => !hasCommandModifier(press) && !press.hasShift;

const CAPTURE_RULES: readonly CaptureRule[] = [
  (press) => (MODIFIER_KEY.test(press.keyName) ? ShortcutCapture.INCOMPLETE : null),
  (press) => (isBare(press) && press.keyName === "Escape" ? ShortcutCapture.CANCEL : null),
  (press) => (isBare(press) && press.keyName === "BackSpace" ? ShortcutCapture.CLEAR : null),
  (press) => (FUNCTION_KEY.test(press.keyName) ? ShortcutCapture.ACCEPT : null),
  (press) => (SPECIAL_KEY.test(press.keyName) ? ShortcutCapture.ACCEPT : null),
  (press) => (hasCommandModifier(press) ? ShortcutCapture.ACCEPT : null),
];

export const classifyShortcutPress = (press: ShortcutPress): ShortcutCapture =>
  CAPTURE_RULES.reduce<ShortcutCapture | null>((decided, rule) => decided ?? rule(press), null) ??
  ShortcutCapture.INVALID;

const HARDWARE_KEY = /^XF86\w+$|^$/;
const HARDWARE_ACCELERATOR = /^((?:<\w+>)*)0x([0-9a-f]+)$/;

const MODIFIER_TAGS: readonly (readonly [keyof ShortcutPress, string])[] = [
  ["hasShift", "<Shift>"],
  ["hasControl", "<Control>"],
  ["hasAlt", "<Alt>"],
  ["hasSuper", "<Super>"],
];

export const usesHardwareKey = (keyName: string): boolean => HARDWARE_KEY.test(keyName);

export const hardwareAccelerator = (press: ShortcutPress, keyCode: number): string =>
  `${MODIFIER_TAGS.filter(([flag]) => press[flag])
    .map(([, tag]) => tag)
    .join("")}0x${keyCode.toString(16)}`;

export const describeHardwareAccelerator = (accelerator: string): string | null => {
  const match = HARDWARE_ACCELERATOR.exec(accelerator);
  if (!match) return null;

  const modifiers = [...(match[1] ?? "").matchAll(/<(\w+)>/g)].map((tag) => tag[1]);
  return [...modifiers, `0x${match[2]}`].join(" + ");
};
