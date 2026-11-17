import { describe, expect, test } from "bun:test";

import { isConversionCandidate } from "@domain/calculator/calculator";
import { parseQuery } from "@domain/query/queryParser";
import { ResultKind } from "@domain/search/searchResult";
import { UnitConversionSearchProvider } from "@provider/unitConversionSearchProvider";
import { identity, makeClipboard, makeUnitConverter } from "@test/support/fakes";

describe("isConversionCandidate", () => {
  test.each([
    ["2 inch em cm", true],
    ["100 f in c", true],
    ["2 + 2", false],
    ["sqrt(16)", false],
    ["firefox", false],
    ["42", false],
  ])("%p: %p", (term, expected) => {
    expect(isConversionCandidate(term)).toBe(expected);
  });
});

describe("UnitConversionSearchProvider", () => {
  test("converte pela Calculadora do GNOME e copia o resultado", async () => {
    const { converter, asked } = makeUnitConverter({ "2 inch em cm": "5,08" });
    const { clipboard, copied } = makeClipboard();
    const provider = new UnitConversionSearchProvider(converter, clipboard, identity);

    const [result] = await provider.search(parseQuery("2 inch em cm"));
    await result?.activate();

    expect(asked).toEqual(["2 inch em cm"]);
    expect(provider.isRemote).toBe(true);
    expect(result?.title).toBe("5,08");
    expect(result?.subtitle).toBe("Press Enter to copy the result");
    expect(result?.kind).toBe(ResultKind.CALCULATOR);
    expect(result?.score).toBeGreaterThanOrEqual(0.95);
    expect(copied).toEqual(["5,08"]);
  });

  test("funciona também no modo `=`", async () => {
    const provider = new UnitConversionSearchProvider(
      makeUnitConverter({ "10 km in mi": "6,21371192237" }).converter,
      makeClipboard().clipboard,
      identity,
    );

    const [result] = await provider.search(parseQuery("= 10 km in mi"));

    expect(result?.title).toBe("6,21371192237");
  });

  test("conta comum fica com a calculadora da extensão, sem consultar a do GNOME", async () => {
    const { converter, asked } = makeUnitConverter({});
    const provider = new UnitConversionSearchProvider(
      converter,
      makeClipboard().clipboard,
      identity,
    );

    expect(await provider.search(parseQuery("2 + 2"))).toEqual([]);
    expect(await provider.search(parseQuery("firefox"))).toEqual([]);
    expect(asked).toEqual([]);
  });

  test("sem resposta da Calculadora não há resultado", async () => {
    const provider = new UnitConversionSearchProvider(
      makeUnitConverter({}).converter,
      makeClipboard().clipboard,
      identity,
    );

    expect(await provider.search(parseQuery("mp3 player 2"))).toEqual([]);
  });
});
