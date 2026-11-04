export interface CaptureDateSummary {
  first: string | null;
  last: string | null;
  missing: number;
}

export function validCaptureDate(value: unknown): boolean;
export function formatCaptureDate(value: unknown): string;
export function captureDateSummary(offers: Array<{ scrape_date?: string }>): CaptureDateSummary;
