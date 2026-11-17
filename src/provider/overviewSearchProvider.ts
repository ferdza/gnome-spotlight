import type { OverviewProvider, OverviewResult } from "@domain/overview/overviewPorts";
import { QueryMode, type ParsedQuery } from "@domain/query/queryParser";
import { ResultKind, type SearchResult } from "@domain/search/searchResult";
import { ModeSearchProvider } from "@provider/modeSearchProvider";

const COVERED_PROVIDERS: ReadonlySet<string> = new Set([
  "applications",
  "org.gnome.Calculator.desktop",
]);
const TOP_SCORE = 0.6;
const SCORE_STEP = 0.05;

export const isCoveredByLauncher = (providerId: string): boolean =>
  COVERED_PROVIDERS.has(providerId);

export class OverviewSearchProvider extends ModeSearchProvider {
  override readonly isRemote = true;

  constructor(private readonly provider: OverviewProvider) {
    super([QueryMode.DEFAULT]);
  }

  async search({ term }: ParsedQuery): Promise<readonly SearchResult[]> {
    const terms = term.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const items = await this.provider.search(terms);
    return items.map((item, position) => this.toResult(item, position));
  }

  private toResult(item: OverviewResult, position: number): SearchResult {
    return {
      id: `overview:${this.provider.id}:${item.id}`,
      title: item.name,
      subtitle: item.description || undefined,
      label: this.provider.name,
      kind: ResultKind.PROVIDER,
      icon: item.icon,
      score: TOP_SCORE - position * SCORE_STEP,
      activate: () => item.activate(),
    };
  }
}
