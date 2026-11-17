export interface WebPage {
  readonly title: string;
  readonly url: string;
}

export interface WebResultsClient {
  find(term: string): Promise<readonly WebPage[]>;
}
