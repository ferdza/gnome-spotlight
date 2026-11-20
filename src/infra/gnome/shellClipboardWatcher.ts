import Meta from "gi://Meta";
import St from "gi://St";

import type { ClipboardHistory } from "@domain/clipboard/clipboardHistory";

export class ShellClipboardWatcher {
  private readonly selection = global.display.get_selection();
  private readonly handlerId: number;

  constructor(private readonly history: ClipboardHistory) {
    this.handlerId = this.selection.connect(
      "owner-changed",
      (_selection: Meta.Selection, type: Meta.SelectionType) => {
        if (type === Meta.SelectionType.SELECTION_CLIPBOARD) this.capture();
      },
    );
    this.capture();
  }

  destroy(): void {
    this.selection.disconnect(this.handlerId);
    this.history.clear();
  }

  private capture(): void {
    St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_clipboard, text) =>
      this.history.record(text),
    );
  }
}
