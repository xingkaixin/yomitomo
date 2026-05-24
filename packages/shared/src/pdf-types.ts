export type PdfMetadata = {
  format: 'pdf';
  fileName: string;
  fileSize: number;
  pageCount: number;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
};

export type PdfRecord = {
  metadata: PdfMetadata;
};
