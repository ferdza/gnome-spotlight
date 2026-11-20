import Gio from "gi://Gio";
import GLib from "gi://GLib";

import type { FilePreview, FilePreviewReader } from "@domain/files/filePorts";
import type { SearchIcon } from "@domain/search/searchResult";

const ATTRIBUTES = [
  "standard::display-name",
  "standard::type",
  "standard::content-type",
  "standard::size",
  "standard::icon",
  "time::modified",
  "thumbnail::path",
].join(",");
const DATE_FORMAT = "%x %R";

Gio._promisify(Gio.File.prototype, "query_info_async", "query_info_finish");

const pickIcon = (file: Gio.File, info: Gio.FileInfo, isImage: boolean): SearchIcon => {
  if (isImage) return { gicon: new Gio.FileIcon({ file }) };

  const thumbnail = info.get_attribute_byte_string("thumbnail::path");
  if (thumbnail) return { gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(thumbnail) }) };

  const icon = info.get_icon();
  return icon ? { gicon: icon } : { name: "text-x-generic" };
};

export class GioFilePreview implements FilePreviewReader {
  async describe(path: string): Promise<FilePreview | null> {
    const file = Gio.File.new_for_path(path);
    try {
      const info = await file.query_info_async(
        ATTRIBUTES,
        Gio.FileQueryInfoFlags.NONE,
        GLib.PRIORITY_DEFAULT,
        null,
      );
      const contentType = info.get_content_type() ?? "";
      const isDirectory = info.get_file_type() === Gio.FileType.DIRECTORY;
      const modified = info.get_modification_date_time()?.format(DATE_FORMAT);

      return {
        title: info.get_display_name(),
        details: [
          Gio.content_type_get_description(contentType),
          isDirectory ? "" : GLib.format_size(info.get_size()),
          modified ?? "",
        ].filter(Boolean),
        path,
        icon: pickIcon(file, info, contentType.startsWith("image/")),
      };
    } catch {
      return null;
    }
  }
}
