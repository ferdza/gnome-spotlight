import type { UriLauncher } from "@domain/launcher/launcherPorts";
import { QueryMode, type ParsedQuery } from "@domain/query/queryParser";
import { ResultKind, type SearchResult } from "@domain/search/searchResult";
import { formatDisplayUrl } from "@domain/web/duckDuckGoResults";
import type { WebPage, WebResultsClient } from "@domain/web/webPorts";
import { ModeSearchProvider } from "@provider/modeSearchProvider";

const RESULT_COUNT = 10;
const TOP_SCORE = 0.9;
const SCORE_STEP = 0.01;

export class WebResultsSearchProvider extends ModeSearchProvider {
  override readonly isRemote = true;

  constructor(
    private readonly client: WebResultsClient,
    private readonly launcher: UriLauncher,
  ) {
    super([QueryMode.WEB]);
  }

  async search({ term }: ParsedQuery): Promise<readonly SearchResult[]> {
    if (!term) return [];

    const pages = await this.client.find(term);
    return pages.slice(0, RESULT_COUNT).map((page, position) => this.toResult(page, position));
  }

  private toResult(page: WebPage, position: number): SearchResult {
    return {
      id: `web:page:${page.url}`,
      title: page.title,
      subtitle: formatDisplayUrl(page.url),
      kind: ResultKind.WEB,
      icon: { name: "web-browser-symbolic" },
      score: TOP_SCORE - position * SCORE_STEP,
      activate: () => this.launcher.openUri(page.url),
    };
  }
}
