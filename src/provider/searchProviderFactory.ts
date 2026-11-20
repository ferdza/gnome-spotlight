import type { AppCatalog, PinnedApps } from "@domain/apps/appPorts";
import type { UnitConverter } from "@domain/calculator/calculatorPorts";
import type { ClipboardHistory } from "@domain/clipboard/clipboardHistory";
import type { DirectoryReader } from "@domain/files/filePorts";
import type {
  Clipboard,
  CommandRunner,
  SearchSettings,
  UriLauncher,
} from "@domain/launcher/launcherPorts";
import type { OverviewProviderCatalog } from "@domain/overview/overviewPorts";
import type { SearchProvider } from "@domain/search/searchProvider";
import type { SystemActionCatalog } from "@domain/system/systemActionPorts";
import type { WebResultsClient } from "@domain/web/webPorts";
import type { WindowCatalog } from "@domain/windows/windowPorts";
import type { Translate } from "@i18n/translate";
import { AppSearchProvider } from "@provider/appSearchProvider";
import { CalculatorSearchProvider } from "@provider/calculatorSearchProvider";
import { ClipboardSearchProvider } from "@provider/clipboardSearchProvider";
import { CommandSearchProvider } from "@provider/commandSearchProvider";
import { FileIndexSearchProvider } from "@provider/fileIndexSearchProvider";
import { FileSearchProvider } from "@provider/fileSearchProvider";
import { KeywordSearchProvider } from "@provider/keywordSearchProvider";
import { isCoveredByLauncher, OverviewSearchProvider } from "@provider/overviewSearchProvider";
import { SuggestionSearchProvider } from "@provider/suggestionSearchProvider";
import { SystemActionSearchProvider } from "@provider/systemActionSearchProvider";
import { UnitConversionSearchProvider } from "@provider/unitConversionSearchProvider";
import { WebResultsSearchProvider } from "@provider/webResultsSearchProvider";
import { WebSearchProvider } from "@provider/webSearchProvider";
import { WindowSearchProvider } from "@provider/windowSearchProvider";

export interface SearchProviderDependencies {
  readonly apps: AppCatalog;
  readonly windows: WindowCatalog;
  readonly systemActions: SystemActionCatalog;
  readonly directories: DirectoryReader;
  readonly launcher: UriLauncher;
  readonly clipboard: Clipboard;
  readonly clipboardHistory: ClipboardHistory;
  readonly pins: PinnedApps;
  readonly commands: CommandRunner;
  readonly webResults: WebResultsClient;
  readonly unitConverter: UnitConverter;
  readonly overviewProviders: OverviewProviderCatalog;
  readonly settings: SearchSettings;
  readonly homeDirectory: string;
  readonly translate: Translate;
}

export const createSearchProviders = (
  deps: SearchProviderDependencies,
): (() => readonly SearchProvider[]) => {
  const launcherProviders: readonly SearchProvider[] = [
    new AppSearchProvider(deps.apps),
    new SuggestionSearchProvider(deps.apps, deps.pins, deps.translate),
    new WindowSearchProvider(deps.windows, deps.translate),
    new CalculatorSearchProvider(deps.clipboard, deps.translate),
    new UnitConversionSearchProvider(deps.unitConverter, deps.clipboard, deps.translate),
    new SystemActionSearchProvider(deps.systemActions),
    new CommandSearchProvider(deps.commands, deps.translate),
    new FileSearchProvider(deps.directories, deps.launcher, deps.homeDirectory),
    new WebSearchProvider(deps.launcher, deps.settings, deps.translate),
    new KeywordSearchProvider(deps.launcher, deps.settings, deps.translate),
    new WebResultsSearchProvider(deps.webResults, deps.launcher),
    new ClipboardSearchProvider(deps.clipboardHistory, deps.clipboard, deps.translate),
    new FileIndexSearchProvider(deps.overviewProviders, deps.launcher),
  ];

  return () => [
    ...launcherProviders,
    ...deps.overviewProviders
      .list()
      .filter((provider) => !isCoveredByLauncher(provider.id))
      .map((provider) => new OverviewSearchProvider(provider)),
  ];
};
