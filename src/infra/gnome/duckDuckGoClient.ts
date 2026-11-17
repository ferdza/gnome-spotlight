import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Soup from "gi://Soup?version=3.0";

import { buildDuckDuckGoUrl, parseDuckDuckGoResults } from "@domain/web/duckDuckGoResults";
import type { WebPage, WebResultsClient } from "@domain/web/webPorts";

const TYPING_PAUSE_MS = 350;
const TIMEOUT_SECONDS = 8;
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";

Gio._promisify(Soup.Session.prototype, "send_and_read_async", "send_and_read_finish");

interface TypingPause {
  readonly source: number;
  readonly resolve: () => void;
}

export class DuckDuckGoClient implements WebResultsClient {
  private readonly session = new Soup.Session({
    user_agent: USER_AGENT,
    timeout: TIMEOUT_SECONDS,
  });
  private cancellable: Gio.Cancellable | null = null;
  private pause: TypingPause | null = null;

  async find(term: string): Promise<readonly WebPage[]> {
    this.cancelPending();
    const cancellable = new Gio.Cancellable();
    this.cancellable = cancellable;

    await this.waitForTypingPause();
    if (cancellable.is_cancelled()) return [];

    try {
      return await this.request(term, cancellable);
    } catch (error) {
      if (cancellable.is_cancelled()) return [];
      throw error;
    }
  }

  destroy(): void {
    this.cancelPending();
    this.session.abort();
  }

  private async request(term: string, cancellable: Gio.Cancellable): Promise<readonly WebPage[]> {
    const message = Soup.Message.new("GET", buildDuckDuckGoUrl(term));
    const bytes = await this.session.send_and_read_async(
      message,
      GLib.PRIORITY_DEFAULT,
      cancellable,
    );

    const status = message.get_status();
    if (status !== Soup.Status.OK) throw new Error(`DuckDuckGo answered HTTP ${status}`);

    return parseDuckDuckGoResults(new TextDecoder().decode(bytes.get_data() ?? new Uint8Array()));
  }

  private waitForTypingPause(): Promise<void> {
    return new Promise((resolve) => {
      const source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TYPING_PAUSE_MS, () => {
        this.pause = null;
        resolve();
        return GLib.SOURCE_REMOVE;
      });
      this.pause = { source, resolve };
    });
  }

  private cancelPending(): void {
    this.cancellable?.cancel();
    this.cancellable = null;

    if (!this.pause) return;
    GLib.source_remove(this.pause.source);
    this.pause.resolve();
    this.pause = null;
  }
}
