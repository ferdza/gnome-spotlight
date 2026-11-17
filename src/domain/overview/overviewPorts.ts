import type { SearchIcon } from "@domain/search/searchResult";

export interface OverviewResult {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly icon: SearchIcon;
  activate(): void;
}

export interface OverviewProvider {
  readonly id: string;
  readonly name?: string;
  search(terms: readonly string[]): Promise<readonly OverviewResult[]>;
}

export interface OverviewProviderCatalog {
  list(): readonly OverviewProvider[];
}
