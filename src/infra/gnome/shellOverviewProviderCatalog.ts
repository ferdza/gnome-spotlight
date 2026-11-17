import type Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import type {
  OverviewProvider,
  OverviewProviderCatalog,
  OverviewResult,
} from "@domain/overview/overviewPorts";
import type { SearchIcon } from "@domain/search/searchResult";

const ICON_SIZE = 32;
const RESULTS_PER_PROVIDER = 3;
const FALLBACK_ICON: SearchIcon = { name: "system-search-symbolic" };

interface ShellResultMeta {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  createIcon?(size: number): Clutter.Actor | null;
}

interface ShellSearchProvider {
  readonly id: string;
  readonly appInfo?: Gio.AppInfo | null;
  getInitialResultSet(terms: string[], cancellable: Gio.Cancellable): Promise<string[]>;
  filterResults?(results: string[], maxNumber: number): string[];
  getResultMetas(ids: string[], cancellable: Gio.Cancellable): Promise<ShellResultMeta[]>;
  activateResult(id: string, terms: string[]): void;
}

interface SearchControllerInternals {
  readonly _searchResults?: { readonly _providers?: readonly ShellSearchProvider[] };
}

const readShellProviders = (): readonly ShellSearchProvider[] => {
  const controller = Main.overview.searchController as unknown as SearchControllerInternals;
  return controller?._searchResults?._providers ?? [];
};

const readIcon = (provider: ShellSearchProvider, meta: ShellResultMeta): SearchIcon => {
  const actor = meta.createIcon?.(ICON_SIZE) ?? null;
  const gicon = actor instanceof St.Icon ? actor.gicon : null;
  actor?.destroy();
  if (gicon) return { gicon };

  const appIcon = provider.appInfo?.get_icon();
  return appIcon ? { gicon: appIcon } : FALLBACK_ICON;
};

class ShellOverviewProvider implements OverviewProvider {
  readonly id: string;
  readonly name?: string;

  constructor(
    private readonly provider: ShellSearchProvider,
    private readonly cancellable: Gio.Cancellable,
  ) {
    this.id = provider.id;
    this.name = provider.appInfo?.get_name() ?? undefined;
  }

  async search(terms: readonly string[]): Promise<readonly OverviewResult[]> {
    const shellTerms = [...terms];
    const ids = await this.provider.getInitialResultSet(shellTerms, this.cancellable);
    const firstIds =
      this.provider.filterResults?.(ids, RESULTS_PER_PROVIDER) ??
      ids.slice(0, RESULTS_PER_PROVIDER);
    if (firstIds.length === 0 || this.cancellable.is_cancelled()) return [];

    const metas = await this.provider.getResultMetas(firstIds, this.cancellable);
    return metas.map((meta) => ({
      id: meta.id,
      name: meta.name,
      description: meta.description,
      icon: readIcon(this.provider, meta),
      activate: () => this.provider.activateResult(meta.id, shellTerms),
    }));
  }
}

export class ShellOverviewProviderCatalog implements OverviewProviderCatalog {
  private cancellable = new Gio.Cancellable();

  list(): readonly OverviewProvider[] {
    this.cancellable.cancel();
    this.cancellable = new Gio.Cancellable();
    const cancellable = this.cancellable;

    return readShellProviders().map((provider) => new ShellOverviewProvider(provider, cancellable));
  }

  destroy(): void {
    this.cancellable.cancel();
  }
}
