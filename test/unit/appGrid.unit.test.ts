import { describe, expect, test } from "bun:test";

import { AppGrid, filterApps, GridMove } from "@domain/apps/appGrid";

import { makeApp } from "../support/fakes";

const apps = ["Zed", "Firefox", "Files", "Calculator", "Blender", "Écouteur", "Maps"].map((name) =>
  makeApp({ id: `${name}.desktop`, name }),
);

describe("filterApps", () => {
  test("sem texto lista tudo em ordem alfabética sem acento", () => {
    expect(filterApps(apps, "").map((app) => app.name)).toEqual([
      "Blender",
      "Calculator",
      "Écouteur",
      "Files",
      "Firefox",
      "Maps",
      "Zed",
    ]);
  });

  test("com texto mantém só quem casa, melhor nota primeiro", () => {
    expect(filterApps(apps, "fi").map((app) => app.name)).toEqual(["Files", "Firefox"]);
  });

  test("usa nome genérico e palavras-chave", () => {
    const catalog = [
      makeApp({ id: "a", name: "Gedit", genericName: "Text Editor" }),
      makeApp({ id: "b", name: "Vlc", keywords: ["video"] }),
    ];

    expect(filterApps(catalog, "editor").map((app) => app.id)).toEqual(["a"]);
    expect(filterApps(catalog, "video").map((app) => app.id)).toEqual(["b"]);
  });
});

describe("AppGrid", () => {
  const sorted = filterApps(apps, "");
  const makeGrid = () => {
    const grid = new AppGrid(3);
    grid.setItems(sorted);
    return grid;
  };

  test("seleciona o primeiro app", () => {
    expect(makeGrid().selected?.name).toBe("Blender");
  });

  test("setas andam na grade", () => {
    const grid = makeGrid();

    grid.move(GridMove.DOWN);
    expect(grid.selected?.name).toBe("Files");
    grid.move(GridMove.RIGHT);
    expect(grid.selected?.name).toBe("Firefox");
    grid.move(GridMove.UP);
    expect(grid.selected?.name).toBe("Calculator");
    grid.move(GridMove.LEFT);
    expect(grid.selected?.name).toBe("Blender");
  });

  test("descer de uma linha cheia para uma última linha curta cai no último app", () => {
    const grid = makeGrid();
    grid.select(4);

    grid.move(GridMove.DOWN);

    expect(grid.selected?.name).toBe("Zed");
  });

  test("não sai da lista", () => {
    const grid = makeGrid();

    grid.move(GridMove.LEFT);
    grid.move(GridMove.UP);
    expect(grid.selectedIndex).toBe(0);
    for (let i = 0; i < 10; i++) grid.move(GridMove.DOWN);
    grid.move(GridMove.DOWN);
    expect(grid.selectedIndex).toBe(sorted.length - 1);
    grid.move(GridMove.RIGHT);
    expect(grid.selectedIndex).toBe(sorted.length - 1);
  });

  test("lista vazia não seleciona nada", () => {
    const grid = new AppGrid(3);
    grid.setItems([]);

    expect(grid.selected).toBeUndefined();
    grid.move(GridMove.DOWN);
    expect(grid.selectedIndex).toBe(-1);
  });
});
