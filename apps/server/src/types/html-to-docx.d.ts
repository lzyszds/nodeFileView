declare module "html-to-docx" {
  type HtmlToDocxOptions = {
    table?: { row?: { cantSplit?: boolean } };
    footer?: boolean;
    pageNumber?: boolean;
    font?: string;
    lang?: string;
    margins?: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };
  };

  export default function HTMLtoDOCX(
    html: string,
    headerHTML?: string | null,
    documentOptions?: HtmlToDocxOptions,
    footerHTML?: string | null,
  ): Promise<Buffer | ArrayBuffer | Blob>;
}
