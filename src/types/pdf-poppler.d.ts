declare module 'pdf-poppler' {
  interface PdfInfo {
    /** File path */
    file: string;
    /** Number of pages */
    pages: number;
    /** PDF Version */
    version: string;
    /** PDF info */
    info: {
      Title?: string;
      Author?: string;
      Creator?: string;
      Producer?: string;
      CreationDate?: string;
      ModDate?: string;
    };
  }

  interface ConvertOptions {
    /** Output format ('jpeg' or 'png') */
    format: 'jpeg' | 'png';
    /** Output directory path */
    out_dir: string;
    /** Output file prefix */
    out_prefix: string;
    /** Page number to convert (null for all pages) */
    page?: number | null;
    /** Image scaling */
    scale?: number;
    /** Image DPI */
    density?: number;
    /** Image quality (1-100) */
    quality?: number;
  }

  /**
   * Get PDF file information
   * @param file Path to PDF file
   * @returns Promise resolving to PDF info
   */
  export function info(file: string): Promise<PdfInfo>;

  /**
   * Convert PDF to images
   * @param file Path to PDF file
   * @param options Conversion options
   * @returns Promise resolving when conversion is complete
   */
  export function convert(file: string, options: ConvertOptions): Promise<void>;
}