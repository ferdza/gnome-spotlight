import { parseQuery, QueryMode, type ParsedQuery } from "@domain/query/queryParser";
import { byRelevance } from "@domain/search/resultOrdering";
import type { SearchProvider } from "@domain/search/searchProvider";
import type { SearchResult } from "@domain/search/searchResult";

export type ProviderSource = () => readonly SearchProvider[];
export type ResultLimit = () => number;
export type ProviderErrorListener = (error: unknown) => void;
export type ResultsUpdateListener = (results: SearchResult[]) => void;

const MINIMUM_LIMIT_BY_MODE: Partial<Record<QueryMode, number>> = {
  [QueryMode.WEB]: 11,
};

const keepBestPerId = (results: readonly SearchResult[]): SearchResult[] => {
  const best = new Map<string, SearchResult>();

  for (const result of results) {
    const existing = best.get(result.id);
    if (existing && existing.score >= result.score) continue;
    best.set(result.id, result);
  }

  return [...best.values()];
};

const listIds = (results: readonly SearchResult[]): string =>
  results.map((result) => result.id).join("\n");

export class SearchService {
  constructor(
    private readonly providers: ProviderSource,
    private readonly limit: ResultLimit,
    private readonly onProviderError: ProviderErrorListener = () => {},
  ) {}

  async search(raw: string, onUpdate: ResultsUpdateListener = () => {}): Promise<SearchResult[]> {
    const query = parseQuery(raw);
    if (!query.term) return [];

    const active = this.providers().filter((provider) => provider.answers(query.mode));
    const remote = active.filter((provider) => provider.isRemote);
    const local = active.filter((provider) => !provider.isRemote);
    const collected: SearchResult[] = [];
    let pendingRemote = remote.length;
    let hasLocalResults = false;
    let shown: string | undefined;

    const publish = (): void => {
      if (!hasLocalResults || pendingRemote === 0) return;

      const ranked = this.rank(collected, query.mode);
      const ids = listIds(ranked);
      if (ids === shown) return;

      shown = ids;
      onUpdate(ranked);
    };

    const remoteDone = Promise.all(
      remote.map(async (provider) => {
        const results = await this.searchSafely(provider, query);
        collected.push(...results);
        pendingRemote -= 1;
        publish();
      }),
    );

    const localResults = await Promise.all(
      local.map((provider) => this.searchSafely(provider, query)),
    );
    collected.push(...localResults.flat());
    hasLocalResults = true;
    publish();

    await remoteDone;
    return this.rank(collected, query.mode);
  }

  private async searchSafely(
    provider: SearchProvider,
    query: ParsedQuery,
  ): Promise<readonly SearchResult[]> {
    try {
      return await provider.search(query);
    } catch (error) {
      this.onProviderError(error);
      return [];
    }
  }

  private rank(results: readonly SearchResult[], mode: QueryMode): SearchResult[] {
    return keepBestPerId(results)
      .sort(byRelevance)
      .slice(0, Math.max(this.limit(), MINIMUM_LIMIT_BY_MODE[mode] ?? 0));
  }
}
