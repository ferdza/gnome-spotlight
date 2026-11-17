/**
 * Rótulo exibido à direita de cada resultado ("App", "Janela"...), um por tipo.
 */
import { describe, expect, test } from "bun:test";

import { getResultKindLabel, getResultLabel } from "@domain/search/resultKindLabel";
import { ResultKind, type SearchResult } from "@domain/search/searchResult";

describe("getResultKindLabel", () => {
  test.each(Object.values(ResultKind))("o tipo %p tem rótulo", (kind) => {
    expect(getResultKindLabel(kind, (m) => m).length).toBeGreaterThan(0);
  });

  test("passa o rótulo pela tradução", () => {
    expect(getResultKindLabel(ResultKind.WINDOW, (m) => `pt:${m}`)).toBe("pt:Window");
  });

  test("rótulo próprio do resultado vence o do tipo", () => {
    const base: SearchResult = {
      id: "x",
      title: "x",
      kind: ResultKind.PROVIDER,
      icon: { name: "x" },
      score: 1,
      activate: () => {},
    };

    expect(getResultLabel({ ...base, label: "YouTube" }, (m) => m)).toBe("YouTube");
    expect(getResultLabel(base, (m) => m)).toBe("Search");
  });
});
