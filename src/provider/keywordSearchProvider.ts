import type { SearchSettings, UriLauncher } from "@domain/launcher/launcherPorts";
import { QueryMode, type ParsedQuery } from "@domain/query/queryParser";
import { ResultKind, type SearchResult } from "@domain/search/searchResult";
import { buildSearchAddress, formatSiteName, matchKeywordSearch } from "@domain/web/keywordSearch";
import { formatMessage, type Translate } from "@i18n/translate";
import { ModeSearchProvider } from "@provider/modeSearchProvider";

const KEYWORD_SEARCH_SCORE = 1;

export class KeywordSearchProvider extends ModeSearchProvider {
  constructor(
    private readonly launcher: UriLauncher,
    private readonly settings: SearchSettings,
    private readonly t: Translate,
  ) {
    super([QueryMode.DEFAULT]);
  }

  async search({ term }: ParsedQuery): Promise<readonly SearchResult[]> {
    const match = matchKeywordSearch(term, this.settings.keywordSearches());
    if (!match) return [];

    const address = buildSearchAddress(match.address, match.text);
    return [
      {
        id: `keyword:${match.keyword}`,
        title: formatMessage(
          this.t("Search %s for “%s”"),
          formatSiteName(match.address),
          match.text,
        ),
        kind: ResultKind.WEB,
        icon: { name: "web-browser-symbolic" },
        score: KEYWORD_SEARCH_SCORE,
        activate: () => this.launcher.openUri(address),
      },
    ];
  }
}
