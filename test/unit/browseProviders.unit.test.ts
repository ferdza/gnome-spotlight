import { describe, expect, test } from "bun:test";

import { ClipboardHistory } from "@domain/clipboard/clipboardHistory";
import { parseQuery } from "@domain/query/queryParser";
import type { SearchProvider } from "@domain/search/searchProvider";
import { ClipboardSearchProvider } from "@provider/clipboardSearchProvider";
import { FileIndexSearchProvider } from "@provider/fileIndexSearchProvider";
import { SuggestionSearchProvider } from "@provider/suggestionSearchProvider";
import { SystemActionSearchProvider } from "@provider/systemActionSearchProvider";
import { SearchService } from "@service/searchService";

import {
  identity,
  makeAppCatalog,
  makeClipboard,
  makeLauncher,
  makeOverviewCatalog,
  makePinnedApps,
  makeSystemActionCatalog,
  makeApp,
} from "../support/fakes";

describe("SuggestionSearchProvider", () => {
  const apps = [
    makeApp({ id: "a.desktop", name: "A", usage: 0.2 }),
    makeApp({ id: "b.desktop", name: "B", usage: 0.9 }),
    makeApp({ id: "c.desktop", name: "C", usage: 0 }),
  ];

  test("fixados primeiro, depois os mais usados, sem repetir", async () => {
    const { catalog } = makeAppCatalog(apps);
    const { pins } = makePinnedApps(["c.desktop", "b.desktop"]);
    const provider = new SuggestionSearchProvider(catalog, pins, identity);

    const results = await provider.search(parseQuery(""));

    expect(results.map((result) => [result.title, result.label])).toEqual([
      ["C", "Pinned"],
      ["B", "Pinned"],
      ["A", "Suggested"],
    ]);
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  test("só responde com a caixa vazia e ativar abre o app", async () => {
    const { catalog, launched } = makeAppCatalog(apps);
    const provider = new SuggestionSearchProvider(catalog, makePinnedApps().pins, identity);

    expect(await provider.search(parseQuery("a"))).toEqual([]);
    const [first] = await provider.search(parseQuery(""));
    await first?.activate();
    expect(launched).toEqual(["b.desktop"]);
  });
});

describe("ClipboardSearchProvider", () => {
  const build = () => {
    const history = new ClipboardHistory();
    ["primeira cópia", "senha do wifi\nlinha 2", "outra coisa"].forEach((text) =>
      history.record(text),
    );
    const { clipboard, copied } = makeClipboard();
    return { provider: new ClipboardSearchProvider(history, clipboard, identity), copied };
  };

  test("lista do mais recente ao mais antigo", async () => {
    const results = await build().provider.search(parseQuery("!"));

    expect(results.map((result) => result.title)).toEqual([
      "outra coisa",
      "senha do wifi",
      "primeira cópia",
    ]);
  });

  test("filtra sem acento nem caixa e traz o texto inteiro na prévia", async () => {
    const [result] = await build().provider.search(parseQuery("!SENHA"));

    expect(result?.preview).toEqual({ kind: "text", text: "senha do wifi\nlinha 2" });
  });

  test("ativar copia o texto de novo", async () => {
    const { provider, copied } = build();

    const [result] = await provider.search(parseQuery("!outra"));
    await result?.activate();

    expect(copied).toEqual(["outra coisa"]);
  });
});

describe("FileIndexSearchProvider", () => {
  const item = { id: "file:///home/maria/Meus%20docs/a.txt", name: "a.txt", icon: { name: "x" } };

  test("pergunta ao provedor de arquivos do GNOME e mostra o arquivo no gerenciador", async () => {
    const { catalog, searched } = makeOverviewCatalog({
      "org.gnome.Nautilus.desktop": { results: [item] },
      "org.gnome.Settings.desktop": { results: [{ ...item, id: "settings" }] },
    });
    const { launcher, revealed } = makeLauncher();
    const provider = new FileIndexSearchProvider(catalog, launcher);

    const results = await provider.search(parseQuery("*a txt"));
    await results[0]?.activate();

    expect(searched).toEqual([{ provider: "org.gnome.Nautilus.desktop", terms: ["a", "txt"] }]);
    expect(results).toHaveLength(1);
    expect(results[0]?.preview).toEqual({ kind: "path", path: "/home/maria/Meus docs/a.txt" });
    expect(revealed).toEqual(["/home/maria/Meus docs/a.txt"]);
  });

  test("sem o provedor de arquivos ligado não devolve nada", async () => {
    const { catalog } = makeOverviewCatalog({});

    expect(
      await new FileIndexSearchProvider(catalog, makeLauncher().launcher).search(parseQuery("*a")),
    ).toEqual([]);
  });
});

describe("caixa vazia no serviço", () => {
  test("só consulta quem declara responder com termo vazio no modo", async () => {
    const { catalog } = makeSystemActionCatalog([
      { id: "lock", name: "Lock", iconName: "x", keywords: [""] },
    ]);
    const quiet: SearchProvider = { answers: () => true, search: async () => [] };
    const service = new SearchService(
      () => [new SystemActionSearchProvider(catalog), quiet],
      () => 8,
    );

    expect(await service.search("")).toEqual([]);
    expect((await service.search(":")).map((result) => result.title)).toEqual(["Lock"]);
  });
});
