import type { ParsedQuery, QueryMode } from "@domain/query/queryParser";
import type { SearchProvider } from "@domain/search/searchProvider";
import type { SearchResult } from "@domain/search/searchResult";

export abstract class ModeSearchProvider implements SearchProvider {
  readonly isRemote: boolean = false;

  protected constructor(
    private readonly modes: readonly QueryMode[],
    private readonly emptyTermModes: readonly QueryMode[] = [],
  ) {}

  answers(mode: QueryMode): boolean {
    return this.modes.includes(mode);
  }

  answersEmptyTerm(mode: QueryMode): boolean {
    return this.emptyTermModes.includes(mode);
  }

  abstract search(query: ParsedQuery): Promise<readonly SearchResult[]>;
}
