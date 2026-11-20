export const ThemeVariant = {
  DARK: "dark",
  LIGHT: "light",
} as const;
export type ThemeVariant = (typeof ThemeVariant)[keyof typeof ThemeVariant];

interface ThemeTokens {
  readonly panelGlass: string;
  readonly panelSolid: string;
  readonly panelBorder: string;
  readonly text: string;
  readonly dimText: string;
  readonly hoverBackground: string;
  readonly separator: string;
  readonly iconTile: string;
  readonly tileSelected: string;
  readonly bubbleFill: string;
}

const THEME_TOKENS: Record<ThemeVariant, ThemeTokens> = {
  [ThemeVariant.DARK]: {
    panelGlass: "rgba(66, 66, 72, 0.5)",
    panelSolid: "rgba(50, 50, 56, 0.97)",
    panelBorder: "rgba(255, 255, 255, 0.14)",
    text: "#ffffff",
    dimText: "rgba(255, 255, 255, 0.6)",
    hoverBackground: "rgba(255, 255, 255, 0.08)",
    separator: "rgba(255, 255, 255, 0.1)",
    iconTile: "rgba(255, 255, 255, 0.1)",
    tileSelected: "rgba(255, 255, 255, 0.18)",
    bubbleFill: "rgba(88, 88, 94, 0.62)",
  },
  [ThemeVariant.LIGHT]: {
    panelGlass: "rgba(255, 255, 255, 0.7)",
    panelSolid: "rgba(250, 250, 252, 0.97)",
    panelBorder: "rgba(0, 0, 0, 0.08)",
    text: "#1f1f24",
    dimText: "rgba(0, 0, 0, 0.55)",
    hoverBackground: "rgba(0, 0, 0, 0.06)",
    separator: "rgba(0, 0, 0, 0.08)",
    iconTile: "rgba(0, 0, 0, 0.06)",
    tileSelected: "rgba(0, 0, 0, 0.12)",
    bubbleFill: "rgba(255, 255, 255, 0.82)",
  },
};

const TEMPLATE = `
.launcher-panel {
  padding: 8px;
  border-radius: 18px;
  color: {{text}};
  border: 1px solid {{panelBorder}};
}

.launcher-panel-glass {
  background-color: {{panelGlass}};
}

.launcher-panel-solid {
  background-color: {{panelSolid}};
}

.launcher-entry {
  padding: 10px 12px;
  font-size: 1.45em;
  color: {{text}};
  caret-color: {{text}};
  selection-background-color: -st-accent-color;
  selected-color: -st-accent-fg-color;
  background-color: transparent;
  border: none;
  box-shadow: none;
}

.launcher-entry-icon {
  icon-size: 18px;
  padding-right: 6px;
  color: {{dimText}};
}

.launcher-separator {
  height: 1px;
  margin: 4px 6px 6px;
  background-color: {{separator}};
}

.launcher-scroll {
  max-height: 460px;
}

.launcher-results {
  spacing: 2px;
}

.launcher-result {
  padding: 7px 10px;
  border-radius: 12px;
  color: {{text}};
  background-color: transparent;
}

.launcher-result:hover {
  background-color: {{hoverBackground}};
}

.launcher-result:selected {
  color: -st-accent-fg-color;
  background-color: -st-accent-color;
}

.launcher-result-row {
  spacing: 12px;
}

.launcher-result-icon {
  icon-size: 24px;
  padding: 4px;
  border-radius: 8px;
  background-color: {{iconTile}};
}

.launcher-result-title {
  font-weight: 600;
}

.launcher-result-subtitle {
  font-size: 0.82em;
  color: {{dimText}};
}

.launcher-result-kind {
  font-size: 0.8em;
  color: {{dimText}};
}

.launcher-result:selected .launcher-result-subtitle {
  color: -st-accent-fg-color;
}

.launcher-result:selected .launcher-result-kind {
  color: -st-accent-fg-color;
}

.launcher-apps {
  spacing: 2px;
}

.launcher-apps-row {
  spacing: 0;
}

.launcher-tile {
  width: 130px;
  height: 104px;
  padding: 8px 4px;
  border-radius: 16px;
  color: {{text}};
  background-color: transparent;
}

.launcher-tile:hover {
  background-color: {{hoverBackground}};
}

.launcher-tile:selected {
  background-color: {{tileSelected}};
}

.launcher-tile-icon {
  icon-size: 52px;
  padding-bottom: 6px;
}

.launcher-tile-label {
  font-size: 0.88em;
  color: {{text}};
}

.launcher-bubbles {
  padding-top: 5px;
  spacing: 10px;
}

.launcher-bubble {
  width: 52px;
  height: 52px;
  border-radius: 26px;
  color: {{text}};
  background-color: {{bubbleFill}};
  border: 1px solid {{panelBorder}};
}

.launcher-bubble:hover {
  background-color: {{tileSelected}};
}

.launcher-bubble:checked {
  color: -st-accent-fg-color;
  background-color: -st-accent-color;
}

.launcher-bubble-icon {
  icon-size: 22px;
}

.launcher-bubble-hint {
  margin-top: 3px;
  font-size: 0.7em;
  color: {{dimText}};
}

.launcher-tile-pin {
  icon-size: 11px;
  padding-right: 4px;
  color: {{dimText}};
}

.launcher-preview {
  width: 420px;
  padding: 18px;
  spacing: 6px;
  border-radius: 18px;
  color: {{text}};
  border: 1px solid {{panelBorder}};
}

.launcher-preview-icon {
  icon-size: 168px;
  padding-bottom: 8px;
}

.launcher-preview-title {
  font-size: 1.15em;
  font-weight: 700;
  text-align: center;
}

.launcher-preview-details {
  color: {{dimText}};
  text-align: center;
}

.launcher-preview-path {
  font-size: 0.82em;
  color: {{dimText}};
  text-align: center;
}

.launcher-preview-text {
  max-height: 260px;
  font-size: 0.95em;
}
`;

export const buildStylesheet = (variant: ThemeVariant): string => {
  const tokens = THEME_TOKENS[variant];
  return TEMPLATE.replace(
    /\{\{(\w+)\}\}/g,
    (_, name: keyof ThemeTokens) => tokens[name],
  ).trimStart();
};
