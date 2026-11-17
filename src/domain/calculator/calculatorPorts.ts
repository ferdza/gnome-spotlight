export interface UnitConverter {
  convert(expression: string): Promise<string | undefined>;
}
