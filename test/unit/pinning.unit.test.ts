import { describe, expect, test } from "bun:test";

import { orderPinnedFirst, togglePinned } from "@domain/apps/pinning";

import { makeApp } from "../support/fakes";

const apps = ["a", "b", "c", "d"].map((id) => makeApp({ id, name: id.toUpperCase() }));

describe("togglePinned", () => {
  test("fixa e desafixa mantendo a ordem de fixação", () => {
    expect(togglePinned([], "b")).toEqual(["b"]);
    expect(togglePinned(["b"], "a")).toEqual(["b", "a"]);
    expect(togglePinned(["b", "a"], "b")).toEqual(["a"]);
  });
});

describe("orderPinnedFirst", () => {
  test("fixados vêm primeiro na ordem em que foram fixados, o resto mantém a ordem", () => {
    expect(orderPinnedFirst(apps, ["c", "a"]).map((app) => app.id)).toEqual(["c", "a", "b", "d"]);
  });

  test("ignora fixados que não estão mais instalados", () => {
    expect(orderPinnedFirst(apps, ["x", "d"]).map((app) => app.id)).toEqual(["d", "a", "b", "c"]);
  });
});
