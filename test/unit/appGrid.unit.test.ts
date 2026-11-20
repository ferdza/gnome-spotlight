import { describe, expect, test } from "bun:test";

import { AppGrid, filterApps, GridMove } from "@domain/launchpad/appGrid";

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
    const grid = new AppGrid({ columns: 3, rows: 2 });
    grid.setItems(sorted);
    return grid;
  };

  test("pagina pelo tamanho da grade e seleciona o primeiro", () => {
    const grid = makeGrid();

    expect(grid.pageCount).toBe(2);
    expect(grid.pageItems).toHaveLength(6);
    expect(grid.selected?.name).toBe("Blender");
  });

  test("setas andam na grade e viram a página sozinhas", () => {
    const grid = makeGrid();

    grid.move(GridMove.DOWN);
    expect(grid.selected?.name).toBe("Files");
    grid.move(GridMove.RIGHT);
    grid.move(GridMove.RIGHT);
    expect(grid.selected?.name).toBe("Maps");
    expect(grid.pageIndex).toBe(0);
    grid.move(GridMove.RIGHT);
    expect(grid.selected?.name).toBe("Zed");
    expect(grid.pageIndex).toBe(1);
    grid.move(GridMove.LEFT);
    expect(grid.pageIndex).toBe(0);
  });

  test("não sai da lista", () => {
    const grid = makeGrid();

    grid.move(GridMove.LEFT);
    grid.move(GridMove.UP);
    expect(grid.selectedIndex).toBe(0);
    for (let i = 0; i < 10; i++) grid.move(GridMove.DOWN);
    expect(grid.selectedIndex).toBeLessThan(sorted.length);
  });

  test("goToPage mantém a posição na página e respeita o fim", () => {
    const grid = makeGrid();

    grid.move(GridMove.RIGHT);
    grid.goToPage(1);
    expect(grid.selected?.name).toBe("Zed");
    grid.goToPage(9);
    expect(grid.pageIndex).toBe(1);
    grid.goToPage(-3);
    expect(grid.pageIndex).toBe(0);
  });

  test("lista vazia não seleciona nada", () => {
    const grid = new AppGrid({ columns: 3, rows: 2 });
    grid.setItems([]);

    expect(grid.selected).toBeUndefined();
    expect(grid.pageCount).toBe(0);
    grid.move(GridMove.DOWN);
    expect(grid.selectedIndex).toBe(-1);
  });

  test("mudar o tamanho da grade mantém o app selecionado", () => {
    const grid = makeGrid();
    grid.selectById("Maps.desktop");

    grid.setShape({ columns: 2, rows: 2 });

    expect(grid.selected?.name).toBe("Maps");
    expect(grid.pageIndex).toBe(1);
  });
});
