// Shared TypeScript types for the entire application

// ─────────────────────────────────────────────
// CONFIDENCE
// ─────────────────────────────────────────────

export interface FieldConfidence {
  score: number;          // 0.0 to 1.0
  source: FieldSource;
  method: string;         // e.g. "exact-gstin", "fuzzy-name", "manual"
}

export type FieldSource = 'extraction' | 'master' | 'rule' | 'manual' | 'default';

export interface ConfidenceData {
  [fieldName: string]: FieldConfidence;
}

// ─────────────────────────────────────────────
// LINE ITEM
// ─────────────────────────────────────────────

export interface LineItem {
  description: string;
  hsn?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  amount?: number;
  taxRate?: number;
}

// ─────────────────────────────────────────────
// EXTRACTED DOCUMENT
// ─────────────────────────────────────────────

export interface ExtractedFields {
  vendorName?: string;
  vendorGstin?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  postingDate?: string;
  placeOfSupply?: string;
  taxableAmount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  totalAmount?: number;
  currency?: string;
  lineItems?: LineItem[];
  remarks?: string;
  documentType?: DocumentType;
}

export interface MasterMatchedFields {
  vendorCode?: string;
  vendorId?: string;
  glAccount?: string;
  taxCode?: string;
  tdsCode?: string;
  distributionRule?: string;
  projectCode?: string;
  warehouse?: string;
  grpoReference?: string;
  itemCode?: string;
  rcmApplicable?: boolean;
  downPayment?: number;
  rounding?: number;
}

export type DocumentType =
  | 'TAX_INVOICE'
  | 'SERVICE_INVOICE'
  | 'FREIGHT'
  | 'CREDIT_NOTE'
  | 'DEBIT_NOTE'
  | 'BILL'
  | 'UNKNOWN';

export type DocStatus = 'PENDING' | 'PROCESSING' | 'EXTRACTED' | 'REVIEWED' | 'ERROR';
export type SessionStatus = 'ACTIVE' | 'EXPORTED' | 'DELETED';

export interface Document {
  id: string;
  sessionId: string;
  vendorId?: string | null;
  fileName: string;
  fileType: string;
  filePath: string;
  fileSize: number;
  pageCount: number;
  documentType: DocumentType;
  status: DocStatus;
  processingError?: string | null;
  rawText?: string | null;

  // Extracted
  vendorName?: string | null;
  vendorGstin?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  postingDate?: string | null;
  placeOfSupply?: string | null;
  taxableAmount?: number | null;
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
  totalAmount?: number | null;
  currency?: string | null;
  lineItems?: LineItem[] | null;
  remarks?: string | null;

  // Master-matched
  vendorCode?: string | null;
  glAccount?: string | null;
  taxCode?: string | null;
  tdsCode?: string | null;
  distributionRule?: string | null;
  projectCode?: string | null;
  warehouse?: string | null;
  grpoReference?: string | null;
  itemCode?: string | null;
  rcmApplicable?: boolean | null;
  downPayment?: number | null;
  rounding?: number | null;

  // Confidence
  confidenceData?: ConfidenceData | null;
  overallConfidence?: number | null;

  isDuplicate?: boolean;
  duplicateOfId?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────
// SESSION
// ─────────────────────────────────────────────

export interface Session {
  id: string;
  name: string;
  status: SessionStatus;
  exportedAt?: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  documents?: Document[];
  _count?: { documents: number };
}

// ─────────────────────────────────────────────
// VENDOR MASTER
// ─────────────────────────────────────────────

export interface Vendor {
  id: string;
  vendorCode: string;
  vendorName: string;
  gstin?: string | null;
  panNumber?: string | null;
  defaultGlAccount?: string | null;
  defaultTaxCode?: string | null;
  defaultTdsCode?: string | null;
  defaultDistRule?: string | null;
  defaultItemType?: string | null;
  defaultRemarks?: string | null;
  placeOfSupply?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  aliases?: VendorAlias[];
}

export interface VendorAlias {
  id: string;
  vendorId: string;
  alias: string;
  createdAt: string;
}

// ─────────────────────────────────────────────
// MATCHING RESULT
// ─────────────────────────────────────────────

export interface MatchResult {
  vendor: Vendor | null;
  method: 'exact-gstin' | 'exact-code' | 'exact-name' | 'alias' | 'fuzzy' | 'none';
  confidence: number;
}

// ─────────────────────────────────────────────
// UPLOAD
// ─────────────────────────────────────────────

export interface UploadResult {
  documentId: string;
  fileName: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  error?: string;
}

// ─────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────

export interface ExportRow {
  'Vendor Code': string;
  'Vendor Name': string;
  'Invoice Number': string;
  'Invoice Date': string;
  'Posting Date': string;
  'Due Date': string;
  'Document Total': number | string;
  'GRPO / Base Reference': string;
  'Item Code': string;
  'Item Description': string;
  'Quantity': number | string;
  'Unit Price': number | string;
  'Discount %': number | string;
  'Tax Code': string;
  'Warehouse': string;
  'G/L Account': string;
  'Distribution Rule': string;
  'Project Code': string;
  'TDS Code': string;
  'RCM Applicable': string;
  'Place of Supply': string;
  'Down Payment': number | string;
  'Rounding': number | string;
  'Remarks': string;
}

// ─────────────────────────────────────────────
// API RESPONSE WRAPPERS
// ─────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ─────────────────────────────────────────────
// APP VERSION
// ─────────────────────────────────────────────

export interface AppVersion {
  version: string;
  buildDate: string;
  buildTimestamp: string;
  environment: string;
  releaseNotes?: string;
}
