const DEFAULT_CAPACITY = 30;
const DEFAULT_MAX_LENGTH = 4000;

export class ClipboardHistory {
  private items: string[] = [];

  constructor(
    private readonly capacity = DEFAULT_CAPACITY,
    private readonly maxLength = DEFAULT_MAX_LENGTH,
  ) {}

  record(text: string | null | undefined): void {
    if (!text?.trim() || text.length > this.maxLength) return;

    this.items = [text, ...this.items.filter((item) => item !== text)].slice(0, this.capacity);
  }

  list(): readonly string[] {
    return this.items;
  }

  clear(): void {
    this.items = [];
  }
}
