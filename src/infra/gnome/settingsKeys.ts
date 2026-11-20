export const SettingsKey = {
  TOGGLE_LAUNCHER: "toggle-launcher",
  TOGGLE_LAUNCHPAD: "toggle-launchpad",
  WEB_SEARCH_URL: "web-search-url",
  MAX_RESULTS: "max-results",
  KEYWORD_SEARCHES: "keyword-searches",
} as const;
export type SettingsKey = (typeof SettingsKey)[keyof typeof SettingsKey];
