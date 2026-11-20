import { toFilesQuery } from "@domain/files/pathQuery";

export const BrowseMode = {
  APPS: "apps",
  FILES: "files",
  ACTIONS: "actions",
  CLIPBOARD: "clipboard",
} as const;
export type BrowseMode = (typeof BrowseMode)[keyof typeof BrowseMode];

export type QueryBrowseMode = Exclude<BrowseMode, typeof BrowseMode.APPS>;

const PREFIXED: Record<Exclude<QueryBrowseMode, typeof BrowseMode.FILES>, string> = {
  [BrowseMode.ACTIONS]: ":",
  [BrowseMode.CLIPBOARD]: "!",
};

export const toBrowseQuery = (mode: QueryBrowseMode, text: string): string =>
  mode === BrowseMode.FILES ? toFilesQuery(text) : `${PREFIXED[mode]}${text}`;
