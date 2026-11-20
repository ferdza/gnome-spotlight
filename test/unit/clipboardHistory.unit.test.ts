import { describe, expect, test } from "bun:test";

import { ClipboardHistory } from "@domain/clipboard/clipboardHistory";

describe("ClipboardHistory", () => {
  test("o mais recente vem primeiro e repetido sobe ao topo", () => {
    const history = new ClipboardHistory();

    ["um", "dois", "tres", "um"].forEach((text) => history.record(text));

    expect(history.list()).toEqual(["um", "tres", "dois"]);
  });

  test("ignora vazio, só espaço e texto grande demais", () => {
    const history = new ClipboardHistory(5, 10);

    [null, undefined, "", "   \n", "x".repeat(11)].forEach((text) => history.record(text));

    expect(history.list()).toEqual([]);
  });

  test("guarda só a capacidade e esquece tudo no clear", () => {
    const history = new ClipboardHistory(2);

    ["a", "b", "c"].forEach((text) => history.record(text));
    expect(history.list()).toEqual(["c", "b"]);

    history.clear();
    expect(history.list()).toEqual([]);
  });
});
