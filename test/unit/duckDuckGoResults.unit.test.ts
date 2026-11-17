import { describe, expect, test } from "bun:test";

import {
  buildDuckDuckGoUrl,
  formatDisplayUrl,
  parseDuckDuckGoResults,
} from "@domain/web/duckDuckGoResults";

const link = (href: string, title: string): string =>
  `<h2 class="result__title"><a rel="nofollow" class="result__a" href="${href}">${title}</a></h2>`;

const redirect = (target: string): string =>
  `//duckduckgo.com/l/?uddg=${encodeURIComponent(target)}&amp;rut=abc123`;

describe("parseDuckDuckGoResults", () => {
  test("lê título e endereço de destino do redirecionamento", () => {
    const html = [
      link(redirect("https://www.gnome.org/"), "GNOME"),
      link(redirect("https://en.wikipedia.org/wiki/GNOME_Shell"), "GNOME Shell - Wikipedia"),
    ].join("\n");

    expect(parseDuckDuckGoResults(html)).toEqual([
      { title: "GNOME", url: "https://www.gnome.org/" },
      { title: "GNOME Shell - Wikipedia", url: "https://en.wikipedia.org/wiki/GNOME_Shell" },
    ]);
  });

  test("decodifica entidades e remove marcação do título", () => {
    const html = link(redirect("https://a.example/"), "What&#x27;s <b>this</b> &amp; that");

    expect(parseDuckDuckGoResults(html)[0]?.title).toBe("What's this & that");
  });

  test("aceita link direto, sem redirecionamento", () => {
    const html = link("https://direct.example/page", "Direto");

    expect(parseDuckDuckGoResults(html)[0]?.url).toBe("https://direct.example/page");
  });

  test("descarta anúncio e endereço que não é http", () => {
    const html = [
      link("https://duckduckgo.com/y.js?ad_domain=shop.example&amp;u3=x", "Anúncio"),
      link(redirect("javascript:alert(1)"), "Script"),
      link(redirect("https://ok.example/"), "Ok"),
    ].join("\n");

    expect(parseDuckDuckGoResults(html).map((page) => page.title)).toEqual(["Ok"]);
  });

  test("endereço repetido aparece uma vez", () => {
    const html = [
      link(redirect("https://a.example/"), "Primeiro"),
      link(redirect("https://a.example/"), "Repetido"),
    ].join("\n");

    expect(parseDuckDuckGoResults(html).map((page) => page.title)).toEqual(["Primeiro"]);
  });

  test("página sem resultados devolve lista vazia", () => {
    expect(parseDuckDuckGoResults("<html><body>No results.</body></html>")).toEqual([]);
  });
});

describe("buildDuckDuckGoUrl", () => {
  test("codifica o termo na versão HTML da busca", () => {
    expect(buildDuckDuckGoUrl("gnome shell & c++")).toBe(
      "https://html.duckduckgo.com/html/?q=gnome%20shell%20%26%20c%2B%2B",
    );
  });
});

describe("formatDisplayUrl", () => {
  test("tira o protocolo, o www e a barra final", () => {
    expect(formatDisplayUrl("https://www.gnome.org/")).toBe("gnome.org");
    expect(formatDisplayUrl("http://en.wikipedia.org/wiki/GNOME")).toBe(
      "en.wikipedia.org/wiki/GNOME",
    );
  });
});
