import type { AppCatalog, AppEntry, PinnedApps } from "@domain/apps/appPorts";
import { QueryMode, type ParsedQuery } from "@domain/query/queryParser";
import { ResultKind, type SearchResult } from "@domain/search/searchResult";
import type { Translate } from "@i18n/translate";
import { ModeSearchProvider } from "@provider/modeSearchProvider";

const MOST_USED_COUNT = 5;
const PINNED_TOP_SCORE = 1;
const PINNED_STEP = 0.01;
const USED_SHARE = 0.8;

export class SuggestionSearchProvider extends ModeSearchProvider {
  constructor(
    private readonly catalog: AppCatalog,
    private readonly pins: PinnedApps,
    private readonly t: Translate,
  ) {
    super([QueryMode.DEFAULT], [QueryMode.DEFAULT]);
  }

  async search({ term }: ParsedQuery): Promise<readonly SearchResult[]> {
    if (term) return [];

    const apps = this.catalog.list();
    const byId = new Map(apps.map((app) => [app.id, app]));
    const pinned = this.pins.list().flatMap((id) => byId.get(id) ?? []);
    const pinnedIds = new Set(pinned.map((app) => app.id));
    const used = apps
      .filter((app) => app.usage > 0 && !pinnedIds.has(app.id))
      .sort((left, right) => right.usage - left.usage)
      .slice(0, MOST_USED_COUNT);

    return [
      ...pinned.map((app, index) =>
        this.toResult(app, this.t("Pinned"), PINNED_TOP_SCORE - index * PINNED_STEP),
      ),
      ...used.map((app) => this.toResult(app, this.t("Suggested"), app.usage * USED_SHARE)),
    ];
  }

  private toResult(app: AppEntry, label: string, score: number): SearchResult {
    return {
      id: `app:${app.id}`,
      title: app.name,
      subtitle: app.description,
      label,
      kind: ResultKind.APP,
      icon: app.icon,
      score,
      activate: () => this.catalog.launch(app.id),
    };
  }
}
