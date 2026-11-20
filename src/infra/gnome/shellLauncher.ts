import Gio from "gi://Gio";
import GLib from "gi://GLib";

import type { UriLauncher } from "@domain/launcher/launcherPorts";

const FILE_MANAGER = "org.freedesktop.FileManager1";

export class ShellLauncher implements UriLauncher {
  openUri(uri: string): void {
    Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
  }

  openPath(path: string): void {
    this.openUri(Gio.File.new_for_path(path).get_uri());
  }

  revealPath(path: string): void {
    const file = Gio.File.new_for_path(path);
    Gio.DBus.session.call(
      FILE_MANAGER,
      "/org/freedesktop/FileManager1",
      FILE_MANAGER,
      "ShowItems",
      new GLib.Variant("(ass)", [[file.get_uri()], ""]),
      null,
      Gio.DBusCallFlags.NONE,
      -1,
      null,
      (connection, result) => {
        try {
          connection?.call_finish(result);
        } catch {
          const parent = file.get_parent()?.get_path();
          if (parent) this.openPath(parent);
        }
      },
    );
  }
}
