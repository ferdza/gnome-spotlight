import { describe, expect, test } from "bun:test";

import type { OverviewProvider, OverviewResult } from "@domain/overview/overviewPorts";
import { parseQuery } from "@domain/query/queryParser";
import { byRelevance } from "@domain/search/resultOrdering";
import { ResultKind } from "@domain/search/searchResult";
import { isCoveredByLauncher, OverviewSearchProvider } from "@provider/overviewSearchProvider";

const icon = { name: "x" };

const makeShellProvider = (
  id: string,
  items: Array<Omit<OverviewResult, "activate">>,
  name?: string,
) => {
  const searched: Array<readonly string[]> = [];
  const activated: string[] = [];
  const shellProvider: OverviewProvider = {
    id,
    name,
    search: async (terms) => {
      searched.push(terms);
      return items.map((item) => ({ ...item, activate: () => activated.push(item.id) }));
    },
  };
  return { shellProvider, searched, activated };
};

describe("OverviewSearchProvider", () => {
  test("consulta o provedor do panorama com os termos do Shell", async () => {
    const { shellProvider, searched } = makeShellProvider("youtube@ext", []);

    await new OverviewSearchProvider(shellProvider).search(parseQuery("  @y  some video "));

    expect(searched).toEqual([["@y", "some", "video"]]);
  });

  test("mostra o resultado com o nome do provedor como rótulo e ativa por ele", async () => {
    const { shellProvider, activated } = makeShellProvider(
      "org.gnome.Settings.desktop",
      [{ id: "wifi", name: "Wi-Fi", description: "Redes", icon }],
      "Settings",
    );

    const [result] = await new OverviewSearchProvider(shellProvider).search(parseQuery("wi"));
    await result?.activate();

    expect(result?.id).toBe("overview:org.gnome.Settings.desktop:wifi");
    expect(result?.title).toBe("Wi-Fi");
    expect(result?.subtitle).toBe("Redes");
    expect(result?.label).toBe("Settings");
    expect(result?.kind).toBe(ResultKind.PROVIDER);
    expect(activated).toEqual(["wifi"]);
  });

  test("provedor sem nome (de extensão) fica com o rótulo do tipo", async () => {
    const { shellProvider } = makeShellProvider("yt@ext", [{ id: "v", name: "YouTube", icon }]);

    const [result] = await new OverviewSearchProvider(shellProvider).search(parseQuery("@y x"));

    expect(result?.label).toBeUndefined();
  });

  test("sem descrição, o subtítulo fica vazio", async () => {
    const { shellProvider } = makeShellProvider("s", [{ id: "w", name: "Wi-Fi", icon }]);

    const [result] = await new OverviewSearchProvider(shellProvider).search(parseQuery("wifi"));

    expect(result?.subtitle).toBeUndefined();
  });

  test("mantém a ordem do provedor e fica abaixo de um app que casou bem", async () => {
    const { shellProvider } = makeShellProvider("files", [
      { id: "z", name: "Zeta", icon },
      { id: "a", name: "Alfa", icon },
    ]);

    const results = await new OverviewSearchProvider(shellProvider).search(parseQuery("x"));

    expect([...results].sort(byRelevance).map((r) => r.title)).toEqual(["Zeta", "Alfa"]);
    expect(results.every((r) => r.score < 0.7)).toBe(true);
  });

  test("é remoto e só responde no modo padrão", () => {
    const provider = new OverviewSearchProvider(makeShellProvider("x", []).shellProvider);

    expect(provider.isRemote).toBe(true);
    expect(provider.answers(parseQuery("x").mode)).toBe(true);
    expect(provider.answers(parseQuery("? x").mode)).toBe(false);
  });
});

describe("isCoveredByLauncher", () => {
  test.each([
    ["applications", true],
    ["org.gnome.Calculator.desktop", true],
    ["org.gnome.Settings.desktop", false],
    ["youtube@ext", false],
  ])("%p: %p", (id, covered) => {
    expect(isCoveredByLauncher(id)).toBe(covered);
  });
});
