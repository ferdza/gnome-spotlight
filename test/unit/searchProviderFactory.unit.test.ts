/**
 * A factory monta um provedor para cada fonte, e todo modo de busca tem quem responda.
 */
import { describe, expect, test } from "bun:test";

import { ClipboardHistory } from "@domain/clipboard/clipboardHistory";
import { QueryMode } from "@domain/query/queryParser";
import { createSearchProviders } from "@provider/searchProviderFactory";
import {
  identity,
  makeAppCatalog,
  makePinnedApps,
  makeClipboard,
  makeCommandRunner,
  makeDirectoryReader,
  makeLauncher,
  makeOverviewCatalog,
  makeSystemActionCatalog,
  makeUnitConverter,
  makeWebResultsClient,
  makeWindowCatalog,
} from "@test/support/fakes";

const listProviders = createSearchProviders({
  apps: makeAppCatalog([]).catalog,
  windows: makeWindowCatalog([]).catalog,
  systemActions: makeSystemActionCatalog([]).catalog,
  directories: makeDirectoryReader({}).reader,
  launcher: makeLauncher().launcher,
  clipboard: makeClipboard().clipboard,
  clipboardHistory: new ClipboardHistory(),
  pins: makePinnedApps().pins,
  commands: makeCommandRunner().runner,
  webResults: makeWebResultsClient([]).client,
  unitConverter: makeUnitConverter({}).converter,
  overviewProviders: makeOverviewCatalog({
    applications: { name: "Apps", results: [] },
    "org.gnome.Calculator.desktop": { name: "Calculator", results: [] },
    "org.gnome.Settings.desktop": { name: "Settings", results: [] },
    "youtube@ext": { results: [] },
  }).catalog,
  settings: { searchUrl: () => "https://example.com/?q=%s", keywordSearches: () => ({}) },
  homeDirectory: "/home/maria",
  translate: identity,
});

describe("createSearchProviders", () => {
  test("cria as treze fontes da extensão e uma por provedor do panorama que ela não cobre", () => {
    expect(listProviders()).toHaveLength(15);
  });

  test.each(Object.values(QueryMode))("o modo %p tem pelo menos um provedor", (mode) => {
    expect(listProviders().some((provider) => provider.answers(mode))).toBe(true);
  });
});
