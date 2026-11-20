import type { ClipboardHistory } from "@domain/clipboard/clipboardHistory";
import type { Clipboard } from "@domain/launcher/launcherPorts";
import { QueryMode, type ParsedQuery } from "@domain/query/queryParser";
import { ResultKind, type SearchResult } from "@domain/search/searchResult";
import { normalizeText } from "@domain/text/textMatcher";
import type { Translate } from "@i18n/translate";
import { ModeSearchProvider } from "@provider/modeSearchProvider";

const TITLE_LIMIT = 90;
const RECENCY_STEP = 0.01;

const firstLine = (text: string): string => {
  const line = text.split("\n").find((candidate) => candidate.trim()) ?? "";
  const trimmed = line.trim();
  return trimmed.length > TITLE_LIMIT ? `${trimmed.slice(0, TITLE_LIMIT)}…` : trimmed;
};

export class ClipboardSearchProvider extends ModeSearchProvider {
  constructor(
    private readonly history: ClipboardHistory,
    private readonly clipboard: Clipboard,
    private readonly t: Translate,
  ) {
    super([QueryMode.CLIPBOARD], [QueryMode.CLIPBOARD]);
  }

  async search({ term }: ParsedQuery): Promise<readonly SearchResult[]> {
    const needle = normalizeText(term);

    return this.history
      .list()
      .filter((text) => !needle || normalizeText(text).includes(needle))
      .map((text, index) => ({
        id: `clipboard:${text}`,
        title: firstLine(text),
        label: this.t("Clipboard"),
        kind: ResultKind.CLIPBOARD,
        icon: { name: "edit-paste-symbolic" },
        score: 1 - index * RECENCY_STEP,
        preview: { kind: "text" as const, text },
        activate: () => this.clipboard.setText(text),
      }));
  }
}
