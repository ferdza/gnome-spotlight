import { describe, expect, test } from "bun:test";

import { BrowseMode, toBrowseQuery } from "@domain/query/browseQuery";
import { parseQuery, QueryMode } from "@domain/query/queryParser";

describe("toBrowseQuery", () => {
  test.each([
    [BrowseMode.FILES, "", "~/", QueryMode.FILES],
    [BrowseMode.FILES, "relatorio", "*relatorio", QueryMode.FILE_INDEX],
    [BrowseMode.FILES, "~/Docs", "~/Docs", QueryMode.FILES],
    [BrowseMode.ACTIONS, "", ":", QueryMode.ACTIONS],
    [BrowseMode.ACTIONS, "lock", ":lock", QueryMode.ACTIONS],
    [BrowseMode.CLIPBOARD, "", "!", QueryMode.CLIPBOARD],
    [BrowseMode.CLIPBOARD, "senha", "!senha", QueryMode.CLIPBOARD],
  ] as const)("%s com %j vira %j", (mode, text, query, parsedMode) => {
    expect(toBrowseQuery(mode, text)).toBe(query);
    expect(parseQuery(query).mode).toBe(parsedMode);
  });
});
