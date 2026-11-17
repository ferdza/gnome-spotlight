import Gio from "gi://Gio";
import GLib from "gi://GLib";

import type { UnitConverter } from "@domain/calculator/calculatorPorts";

const BUS_NAME = "org.gnome.Calculator.SearchProvider";
const OBJECT_PATH = "/org/gnome/Calculator/SearchProvider";
const INTERFACE = "org.gnome.Shell.SearchProvider2";
const CALL_TIMEOUT_MS = 2000;
const OPEN_IN_CALCULATOR = "open-in-calculator-";

Gio._promisify(Gio.DBusConnection.prototype, "call", "call_finish");

type ResultMeta = Record<string, unknown>;

const isQuietFailure = (error: unknown): boolean =>
  error instanceof GLib.Error &&
  (error.matches(Gio.DBusError, Gio.DBusError.SERVICE_UNKNOWN) ||
    error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED));

export class GnomeCalculatorConverter implements UnitConverter {
  private readonly cancellable = new Gio.Cancellable();

  async convert(expression: string): Promise<string | undefined> {
    try {
      return await this.solve(expression);
    } catch (error) {
      if (isQuietFailure(error)) return undefined;
      throw error;
    }
  }

  destroy(): void {
    this.cancellable.cancel();
  }

  private async solve(expression: string): Promise<string | undefined> {
    const terms = expression.trim().split(/\s+/);
    const reply = await this.call("GetInitialResultSet", new GLib.Variant("(as)", [terms]));
    const [ids] = reply.deepUnpack<[string[]]>();

    const id = ids.find((candidate) => !candidate.startsWith(OPEN_IN_CALCULATOR));
    if (!id) return undefined;

    const metas = await this.call("GetResultMetas", new GLib.Variant("(as)", [[id]]));
    const [[meta]] = metas.recursiveUnpack<[ResultMeta[]]>();
    const text = meta?.clipboardText;
    return typeof text === "string" ? text : undefined;
  }

  private call(method: string, parameters: GLib.Variant): Promise<GLib.Variant> {
    return Gio.DBus.session.call(
      BUS_NAME,
      OBJECT_PATH,
      INTERFACE,
      method,
      parameters,
      null,
      Gio.DBusCallFlags.NONE,
      CALL_TIMEOUT_MS,
      this.cancellable,
    );
  }
}
