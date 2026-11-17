export type KeywordSearches = Readonly<Record<string, string>>;

export interface KeywordSearchMatch {
  readonly keyword: string;
  readonly address: string;
  readonly text: string;
}

const KEYWORD_AND_TEXT = /^(\S+)\s+(\S[\s\S]*)$/;
const SEARCH_ADDRESS = /^https?:\/\/\S+$/i;
const PLACEHOLDER = "%s";

export const matchKeywordSearch = (
  term: string,
  searches: KeywordSearches,
): KeywordSearchMatch | undefined => {
  const [, typed = "", text = ""] = KEYWORD_AND_TEXT.exec(term.trim()) ?? [];
  const keyword = Object.keys(searches).find((key) => key.toLowerCase() === typed.toLowerCase());
  const address = keyword ? searches[keyword] : undefined;
  if (!keyword || !address) return undefined;

  return { keyword, address, text };
};

export const buildSearchAddress = (template: string, text: string): string =>
  template.replace(PLACEHOLDER, encodeURIComponent(text));

export const isValidKeyword = (keyword: string): boolean => /^\S+$/.test(keyword);

export const isValidSearchAddress = (address: string): boolean =>
  SEARCH_ADDRESS.test(address) && address.includes(PLACEHOLDER);

export const formatSiteName = (address: string): string =>
  address
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0] ?? address;
