import type { SearchIcon } from "@domain/search/searchResult";

export interface FileEntry {
  readonly name: string;
  readonly isDirectory: boolean;
  readonly icon: SearchIcon;
}

export interface DirectoryReader {
  list(directory: string): Promise<readonly FileEntry[]>;
}

export interface FilePreview {
  readonly title: string;
  readonly details: readonly string[];
  readonly path: string;
  readonly icon: SearchIcon;
}

export interface FilePreviewReader {
  describe(path: string): Promise<FilePreview | null>;
}
