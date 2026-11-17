import { describe, expect, test } from "bun:test";

import {
  buildSearchAddress,
  formatSiteName,
  isValidKeyword,
  isValidSearchAddress,
  matchKeywordSearch,
} from "@domain/web/keywordSearch";

const searches = { "@y": "https://www.youtube.com/results?search_query=%s" };

describe("matchKeywordSearch", () => {
  test("a primeira palavra é o atalho e o resto é o texto buscado", () => {
    expect(matchKeywordSearch("@y  gatos  fofos", searches)).toEqual({
      keyword: "@y",
      address: "https://www.youtube.com/results?search_query=%s",
      text: "gatos  fofos",
    });
  });

  test("ignora maiúsculas no atalho", () => {
    expect(matchKeywordSearch("@Y gatos", searches)?.keyword).toBe("@y");
  });

  test("atalho sem texto ou palavra que não é atalho não casa", () => {
    expect(matchKeywordSearch("@y", searches)).toBeUndefined();
    expect(matchKeywordSearch("@yt gatos", searches)).toBeUndefined();
    expect(matchKeywordSearch("firefox", searches)).toBeUndefined();
  });
});

describe("buildSearchAddress", () => {
  test("troca o %s pelo texto codificado", () => {
    expect(buildSearchAddress("https://s.example/?q=%s", "c++ & go")).toBe(
      "https://s.example/?q=c%2B%2B%20%26%20go",
    );
  });
});

describe("validação do formulário", () => {
  test.each([
    ["@y", true],
    ["yt", true],
    ["", false],
    ["@ y", false],
  ])("atalho %p: %p", (keyword, valid) => {
    expect(isValidKeyword(keyword)).toBe(valid);
  });

  test.each([
    ["https://www.youtube.com/results?search_query=%s", true],
    ["http://localhost:8080/?q=%s", true],
    ["https://www.youtube.com/", false],
    ["youtube.com/?q=%s", false],
    ["javascript:alert('%s')", false],
  ])("endereço %p: %p", (address, valid) => {
    expect(isValidSearchAddress(address)).toBe(valid);
  });
});

describe("formatSiteName", () => {
  test("mostra só o domínio, sem www", () => {
    expect(formatSiteName("https://www.youtube.com/results?search_query=%s")).toBe("youtube.com");
    expect(formatSiteName("https://en.wikipedia.org/w/index.php?search=%s")).toBe(
      "en.wikipedia.org",
    );
  });
});
