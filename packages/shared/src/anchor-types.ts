export type TextAnchor = {
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
  paragraphId?: string;
  chapterId?: string;
  segmentId?: string;
  textStartInParagraph?: number;
  textEndInParagraph?: number;
  textStartInBook?: number;
  textEndInBook?: number;
  quoteHash?: string;
};

export type PdfRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfTextAnchor = TextAnchor & {
  kind: 'pdf-text';
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  rects: PdfRect[];
};
