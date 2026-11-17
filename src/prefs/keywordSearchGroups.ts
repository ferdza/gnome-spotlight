import Adw from "gi://Adw";
import type Gio from "gi://Gio";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk";
import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import {
  isValidKeyword,
  isValidSearchAddress,
  type KeywordSearches,
} from "@domain/web/keywordSearch";
import { SettingsKey } from "@infra/gnome/settingsKeys";

export class KeywordSearchGroups {
  readonly listGroup: Adw.PreferencesGroup;
  readonly formGroup: Adw.PreferencesGroup;
  private rows: Adw.ActionRow[] = [];
  private readonly keywordEntry = new Adw.EntryRow({ title: _("Keyword") });
  private readonly addressEntry = new Adw.EntryRow({
    title: _("Address (%s is the searched text)"),
  });
  private readonly addButton = new Gtk.Button({
    label: _("Add"),
    halign: Gtk.Align.END,
    margin_top: 12,
    sensitive: false,
    css_classes: ["suggested-action"],
  });

  constructor(private readonly settings: Gio.Settings) {
    this.listGroup = new Adw.PreferencesGroup({
      title: _("Keyword searches"),
      description: _("Type the keyword before the text, for example: @y cats"),
    });
    this.formGroup = new Adw.PreferencesGroup({ title: _("New keyword search") });
    this.formGroup.add(this.keywordEntry);
    this.formGroup.add(this.addressEntry);
    this.formGroup.add(this.addButton);

    this.keywordEntry.connect("changed", () => this.syncAddButton());
    this.addressEntry.connect("changed", () => this.syncAddButton());
    this.addressEntry.connect("entry-activated", () => this.addFromForm());
    this.addButton.connect("clicked", () => this.addFromForm());
    settings.connect(`changed::${SettingsKey.KEYWORD_SEARCHES}`, () => this.syncRows());
    this.syncRows();
  }

  private readSearches(): KeywordSearches {
    return this.settings
      .get_value(SettingsKey.KEYWORD_SEARCHES)
      .deepUnpack<Record<string, string>>();
  }

  private saveSearches(searches: KeywordSearches): void {
    this.settings.set_value(SettingsKey.KEYWORD_SEARCHES, new GLib.Variant("a{ss}", searches));
  }

  private isFormValid(): boolean {
    return (
      isValidKeyword(this.keywordEntry.text.trim()) &&
      isValidSearchAddress(this.addressEntry.text.trim())
    );
  }

  private syncAddButton(): void {
    this.addButton.sensitive = this.isFormValid();
  }

  private addFromForm(): void {
    if (!this.isFormValid()) return;

    const keyword = this.keywordEntry.text.trim();
    this.saveSearches({ ...this.readSearches(), [keyword]: this.addressEntry.text.trim() });
    this.keywordEntry.text = "";
    this.addressEntry.text = "";
  }

  private remove(keyword: string): void {
    const searches = { ...this.readSearches() };
    delete searches[keyword];
    this.saveSearches(searches);
  }

  private syncRows(): void {
    for (const row of this.rows) this.listGroup.remove(row);

    this.rows = Object.entries(this.readSearches())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([keyword, address]) => this.buildRow(keyword, address));

    for (const row of this.rows) this.listGroup.add(row);
  }

  private buildRow(keyword: string, address: string): Adw.ActionRow {
    const row = new Adw.ActionRow({ title: keyword, subtitle: address });
    const removeButton = new Gtk.Button({
      icon_name: "user-trash-symbolic",
      tooltip_text: _("Remove"),
      valign: Gtk.Align.CENTER,
      css_classes: ["flat"],
    });
    removeButton.connect("clicked", () => this.remove(keyword));
    row.add_suffix(removeButton);
    return row;
  }
}
