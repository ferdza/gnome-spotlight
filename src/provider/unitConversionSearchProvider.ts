import { isConversionCandidate } from "@domain/calculator/calculator";
import type { UnitConverter } from "@domain/calculator/calculatorPorts";
import type { Clipboard } from "@domain/launcher/launcherPorts";
import { QueryMode, type ParsedQuery } from "@domain/query/queryParser";
import { ResultKind, type SearchResult } from "@domain/search/searchResult";
import type { Translate } from "@i18n/translate";
import { ModeSearchProvider } from "@provider/modeSearchProvider";

const CONVERSION_SCORE = 0.97;

export class UnitConversionSearchProvider extends ModeSearchProvider {
  override readonly isRemote = true;

  constructor(
    private readonly converter: UnitConverter,
    private readonly clipboard: Clipboard,
    private readonly t: Translate,
  ) {
    super([QueryMode.DEFAULT, QueryMode.CALCULATOR]);
  }

  async search({ term }: ParsedQuery): Promise<readonly SearchResult[]> {
    if (!isConversionCandidate(term)) return [];

    const converted = await this.converter.convert(term);
    if (!converted) return [];

    return [
      {
        id: "calculator:conversion",
        title: converted,
        subtitle: this.t("Press Enter to copy the result"),
        kind: ResultKind.CALCULATOR,
        icon: { name: "accessories-calculator-symbolic" },
        score: CONVERSION_SCORE,
        activate: () => this.clipboard.setText(converted),
      },
    ];
  }
}
