import { describe, expect, test } from "bun:test";

import { parseQuery } from "@domain/query/queryParser";
import { byRelevance } from "@domain/search/resultOrdering";
import { ResultKind } from "@domain/search/searchResult";
import { WebResultsSearchProvider } from "@provider/webResultsSearchProvider";
import { makeLauncher, makeWebResultsClient } from "@test/support/fakes";

const pages = Array.from({ length: 12 }, (_, i) => ({
  title: `Página ${String.fromCharCode(90 - i)}`,
  url: `https://site${i}.example/`,
}));

describe("WebResultsSearchProvider", () => {
  test("mostra os 10 primeiros resultados na ordem do buscador", async () => {
    const { client, searched } = makeWebResultsClient(pages);
    const provider = new WebResultsSearchProvider(client, makeLauncher().launcher);

    const results = await provider.search(parseQuery("? gnome shell"));

    expect(searched).toEqual(["gnome shell"]);
    expect(results).toHaveLength(10);
    expect([...results].sort(byRelevance).map((r) => r.id)).toEqual(
      pages.slice(0, 10).map((page) => `web:page:${page.url}`),
    );
  });

  test("ficam abaixo do atalho para a página completa da busca", async () => {
    const provider = new WebResultsSearchProvider(
      makeWebResultsClient(pages).client,
      makeLauncher().launcher,
    );

    const results = await provider.search(parseQuery("? gnome"));

    expect(results.every((r) => r.score < 1)).toBe(true);
  });

  test("Enter abre a página do resultado", async () => {
    const { launcher, uris } = makeLauncher();
    const provider = new WebResultsSearchProvider(makeWebResultsClient(pages).client, launcher);

    const [first] = await provider.search(parseQuery("? gnome"));
    await first?.activate();

    expect(first?.title).toBe("Página Z");
    expect(first?.subtitle).toBe("site0.example");
    expect(first?.kind).toBe(ResultKind.WEB);
    expect(uris).toEqual(["https://site0.example/"]);
  });

  test("só consulta a internet com o prefixo `?`", () => {
    const provider = new WebResultsSearchProvider(
      makeWebResultsClient(pages).client,
      makeLauncher().launcher,
    );

    expect(provider.answers(parseQuery("? gnome").mode)).toBe(true);
    expect(provider.answers(parseQuery("gnome").mode)).toBe(false);
    expect(provider.isRemote).toBe(true);
  });
});
