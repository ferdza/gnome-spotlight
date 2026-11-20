import type Gio from "gi://Gio";

import type { PinnedApps } from "@domain/apps/appPorts";
import { togglePinned } from "@domain/apps/pinning";
import { SettingsKey } from "@infra/gnome/settingsKeys";

export class SettingsPinnedApps implements PinnedApps {
  constructor(private readonly settings: Gio.Settings) {}

  list(): readonly string[] {
    return this.settings.get_strv(SettingsKey.PINNED_APPS);
  }

  toggle(id: string): void {
    this.settings.set_strv(SettingsKey.PINNED_APPS, togglePinned(this.list(), id));
  }
}
