import type Gio from "gi://Gio";

export const ResultKind = {
  APP: "app",
  WINDOW: "window",
  CALCULATOR: "calculator",
  COMMAND: "command",
  FILE: "file",
  FOLDER: "folder",
  SYSTEM: "system",
  WEB: "web",
  PROVIDER: "provider",
  CLIPBOARD: "clipboard",
} as const;
export type ResultKind = (typeof ResultKind)[keyof typeof ResultKind];

export type ResultPreview =
  | { readonly kind: "path"; readonly path: string }
  | { readonly kind: "text"; readonly text: string };

export type SearchIcon = { readonly name: string } | { readonly gicon: Gio.Icon };

export interface SearchResult {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly label?: string;
  readonly kind: ResultKind;
  readonly icon: SearchIcon;
  readonly score: number;
  readonly completion?: string;
  readonly preview?: ResultPreview;
  activate(): void | Promise<void>;
}
