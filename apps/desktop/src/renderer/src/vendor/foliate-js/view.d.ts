export class ResponseError extends Error {}
export class NotFoundError extends Error {}
export class UnsupportedTypeError extends Error {}

export function makeBook(file: File | Blob | string): Promise<unknown>;

export type FoliatePageInfo = {
  sectionIndex: number;
  pageIndex: number;
  pageCount: number;
};

export class View extends HTMLElement {
  getPageInfo(): FoliatePageInfo | null;
}
