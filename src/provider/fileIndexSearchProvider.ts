import { uriToPath } from "@domain/files/pathQuery";
import type { UriLauncher } from "@domain/launcher/launcherPorts";
import type { OverviewProviderCatalog, OverviewResult } from "@domain/overview/overviewPorts";
import { QueryMode, type ParsedQuery } from "@domain/query/queryParser";
import { ResultKind, type SearchResult } from "@domain/search/searchResult";
import { ModeSearchProvider } from "@provider/modeSearchProvider";

export const FILE_INDEX_PROVIDER_ID = "org.gnome.Nautilus.desktop";

const RESULT_LIMIT = 12;
const TOP_SCORE = 0.9;
const SCORE_STEP = 0.02;

export class FileIndexSearchProvider extends ModeSearchProvider {
  override readonly isRemote = true;

  constructor(
    private readonly catalog: OverviewProviderCatalog,
    private readonly launcher: UriLauncher,
  ) {
    super([QueryMode.FILE_INDEX]);
  }

  async search({ term }: ParsedQuery): Promise<readonly SearchResult[]> {
    const terms = term.split(/\s+/).filter(Boolean);
    const provider = this.catalog
      .list()
      .find((candidate) => candidate.id === FILE_INDEX_PROVIDER_ID);
    if (!provider || terms.length === 0) return [];

    const items = await provider.search(terms, RESULT_LIMIT);
    return items.map((item, position) => this.toResult(item, position));
  }

  private toResult(item: OverviewResult, position: number): SearchResult {
    const path = uriToPath(item.id);
    return {
      id: `file-index:${item.id}`,
      title: item.name,
      subtitle: item.description || undefined,
      kind: ResultKind.FILE,
      icon: item.icon,
      score: TOP_SCORE - position * SCORE_STEP,
      preview: path ? { kind: "path", path } : undefined,
      activate: () => (path ? this.launcher.revealPath(path) : item.activate()),
    };
  }
}
