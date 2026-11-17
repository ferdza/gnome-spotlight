/**
 * Orquestração da busca: escolhe os provedores do modo, junta, ordena por nota e corta
 * no limite. Provedor que falha não derruba os demais.
 */
import { describe, expect, test } from "bun:test";

import type { QueryMode } from "@domain/query/queryParser";
import type { SearchProvider } from "@domain/search/searchProvider";
import { ResultKind, type SearchResult } from "@domain/search/searchResult";
import { SearchService } from "@service/searchService";

const result = (id: string, score: number, title = id): SearchResult => ({
  id,
  title,
  kind: ResultKind.APP,
  icon: { name: "x" },
  score,
  activate: () => {},
});

const provider = (
  modes: QueryMode[],
  results: SearchResult[] | Error,
  isRemote = false,
): SearchProvider => ({
  isRemote,
  answers: (mode) => modes.includes(mode),
  search: async () => {
    if (results instanceof Error) throw results;
    return results;
  },
});

const nextTick = (): SearchProvider => ({
  isRemote: true,
  answers: () => true,
  search: () => new Promise((resolve) => setTimeout(() => resolve([]), 0)),
});

describe("SearchService", () => {
  test("termo vazio não consulta ninguém", async () => {
    let called = false;
    const spy: SearchProvider = {
      answers: () => true,
      search: async () => {
        called = true;
        return [];
      },
    };

    const service = new SearchService(
      () => [spy],
      () => 8,
    );

    expect(await service.search("  ")).toEqual([]);
    expect(called).toBe(false);
  });

  test("junta provedores do modo e ordena pela nota", async () => {
    const service = new SearchService(
      () => [
        provider(["default"], [result("a", 0.5)]),
        provider(["default"], [result("b", 0.9), result("c", 0.1)]),
      ],
      () => 8,
    );

    const results = await service.search("x");

    expect(results.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  test("empate na nota ordena pelo título", async () => {
    const service = new SearchService(
      () => [provider(["default"], [result("2", 0.5, "Zeta"), result("1", 0.5, "Alfa")])],
      () => 8,
    );

    expect((await service.search("x")).map((r) => r.title)).toEqual(["Alfa", "Zeta"]);
  });

  test("ignora provedores de outro modo", async () => {
    const service = new SearchService(
      () => [
        provider(["default"], [result("app", 1)]),
        provider(["terminal-command"], [result("cmd", 1)]),
      ],
      () => 8,
    );

    expect((await service.search("> htop")).map((r) => r.id)).toEqual(["cmd"]);
  });

  test("corta no limite configurado", async () => {
    const many = Array.from({ length: 20 }, (_, i) => result(`r${i}`, 1 - i / 100));
    const service = new SearchService(
      () => [provider(["default"], many)],
      () => 5,
    );

    expect(await service.search("x")).toHaveLength(5);
  });

  test("busca na web mostra pelo menos 11 linhas: a página completa e 10 resultados", async () => {
    const many = Array.from({ length: 20 }, (_, i) => result(`r${i}`, 1 - i / 100));
    const service = new SearchService(
      () => [provider(["web"], many)],
      () => 5,
    );

    expect(await service.search("? x")).toHaveLength(11);
  });

  test("limite configurado acima do mínimo da web continua valendo", async () => {
    const many = Array.from({ length: 20 }, (_, i) => result(`r${i}`, 1 - i / 100));
    const service = new SearchService(
      () => [provider(["web"], many)],
      () => 15,
    );

    expect(await service.search("? x")).toHaveLength(15);
  });

  test("provedor com erro é ignorado", async () => {
    const service = new SearchService(
      () => [provider(["default"], new Error("falhou")), provider(["default"], [result("ok", 1)])],
      () => 8,
    );

    expect((await service.search("x")).map((r) => r.id)).toEqual(["ok"]);
  });

  test("resultado repetido (mesmo id) aparece uma vez, com a maior nota", async () => {
    const service = new SearchService(
      () => [
        provider(["default"], [result("dup", 0.4)]),
        provider(["default"], [result("dup", 0.8)]),
      ],
      () => 8,
    );

    const results = await service.search("x");

    expect(results).toHaveLength(1);
    expect(results[0]?.score).toBe(0.8);
  });

  test("com provedor remoto, os locais aparecem antes e a lista completa depois", async () => {
    let releaseRemote!: () => void;
    const remote: SearchProvider = {
      isRemote: true,
      answers: () => true,
      search: () =>
        new Promise((resolve) => {
          releaseRemote = () => resolve([result("remoto", 0.9)]);
        }),
    };
    const service = new SearchService(
      () => [provider(["default"], [result("local", 0.5)]), remote],
      () => 8,
    );
    const updates: string[][] = [];

    const pending = service.search("x", (results) => {
      updates.push(results.map((r) => r.id));
      releaseRemote();
    });

    expect((await pending).map((r) => r.id)).toEqual(["remoto", "local"]);
    expect(updates).toEqual([["local"]]);
  });

  test("provedor remoto lento não segura o que já chegou dos outros", async () => {
    const never: SearchProvider = {
      isRemote: true,
      answers: () => true,
      search: () => new Promise(() => {}),
    };
    const service = new SearchService(
      () => [
        provider(["default"], [result("local", 0.5)]),
        provider(["default"], [result("rapido", 0.9)], true),
        never,
      ],
      () => 8,
    );
    const updates: string[][] = [];

    void service.search("x", (results) => updates.push(results.map((r) => r.id)));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(updates.at(-1)).toEqual(["rapido", "local"]);
  });

  test("remoto que não muda a lista não gera nova entrega", async () => {
    const service = new SearchService(
      () => [provider(["default"], [result("local", 0.5)]), nextTick(), nextTick(), nextTick()],
      () => 8,
    );
    const updates: string[][] = [];

    await service.search("x", (results) => updates.push(results.map((r) => r.id)));

    expect(updates).toEqual([["local"]]);
  });

  test("remoto com erro vai para o tratador e os outros seguem", async () => {
    const errors: unknown[] = [];
    const service = new SearchService(
      () => [
        provider(["default"], [result("local", 0.5)]),
        provider(["default"], new Error("caiu"), true),
      ],
      () => 8,
      (error) => errors.push(error),
    );

    expect((await service.search("x")).map((r) => r.id)).toEqual(["local"]);
    expect(errors).toHaveLength(1);
  });

  test("lê a lista de provedores a cada busca", async () => {
    const providers: SearchProvider[] = [];
    const service = new SearchService(
      () => providers,
      () => 8,
    );

    providers.push(provider(["default"], [result("novo", 1)]));

    expect((await service.search("x")).map((r) => r.id)).toEqual(["novo"]);
  });

  test("sem provedor remoto não há entrega antecipada", async () => {
    const service = new SearchService(
      () => [provider(["default"], [result("a", 1)])],
      () => 8,
    );
    let early = 0;

    await service.search("x", () => {
      early += 1;
    });

    expect(early).toBe(0);
  });
});
