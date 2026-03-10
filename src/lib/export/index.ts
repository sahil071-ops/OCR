// Excel export module
// Converts reviewed documents to the fixed AP/invoice Excel format

import ExcelJS from 'exceljs';
import type { Document, ExportRow, Session } from '@/types';
import { formatDate } from '@/lib/utils';
import { APP_VERSION, BUILD_TIMESTAMP } from '@/lib/version';

/**
 * Generates an Excel workbook from a session's reviewed documents
 * Returns a Buffer containing the .xlsx file
 */
export async function generateExcelExport(
  session: Session,
  documents: Document[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // Set workbook metadata
  workbook.creator = 'Invoice Scanner PWA';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties.date1904 = false;

  // ─── Main Data Sheet ───
  const sheet = workbook.addWorksheet('Invoice Data', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
    },
  });

  // Define columns
  const columns: Partial<ExcelJS.Column>[] = [
    { header: 'Vendor Code', key: 'vendorCode', width: 15 },
    { header: 'Vendor Name', key: 'vendorName', width: 30 },
    { header: 'Invoice Number', key: 'invoiceNumber', width: 20 },
    { header: 'Invoice Date', key: 'invoiceDate', width: 15 },
    { header: 'Posting Date', key: 'postingDate', width: 15 },
    { header: 'Due Date', key: 'dueDate', width: 15 },
    { header: 'Document Total', key: 'total', width: 18 },
    { header: 'GRPO / Base Reference', key: 'grpo', width: 25 },
    { header: 'Item Code', key: 'itemCode', width: 15 },
    { header: 'Item Description', key: 'itemDesc', width: 40 },
    { header: 'Quantity', key: 'qty', width: 12 },
    { header: 'Unit Price', key: 'unitPrice', width: 15 },
    { header: 'Discount %', key: 'discount', width: 12 },
    { header: 'Tax Code', key: 'taxCode', width: 15 },
    { header: 'Warehouse', key: 'warehouse', width: 20 },
    { header: 'G/L Account', key: 'glAccount', width: 20 },
    { header: 'Distribution Rule', key: 'distRule', width: 20 },
    { header: 'Project Code', key: 'projectCode', width: 15 },
    { header: 'TDS Code', key: 'tdsCode', width: 15 },
    { header: 'RCM Applicable', key: 'rcm', width: 15 },
    { header: 'Place of Supply', key: 'pos', width: 20 },
    { header: 'Down Payment', key: 'downPayment', width: 15 },
    { header: 'Rounding', key: 'rounding', width: 12 },
    { header: 'Remarks', key: 'remarks', width: 40 },
    { header: 'GSTIN', key: 'gstin', width: 20 },
    { header: 'Taxable Amount', key: 'taxable', width: 18 },
    { header: 'CGST', key: 'cgst', width: 12 },
    { header: 'SGST', key: 'sgst', width: 12 },
    { header: 'IGST', key: 'igst', width: 12 },
    { header: 'Document Type', key: 'docType', width: 18 },
    { header: 'File Name', key: 'fileName', width: 30 },
    { header: 'Confidence %', key: 'confidence', width: 15 },
  ];

  sheet.columns = columns;

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A5F' }, // Dark navy
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 30;

  // Add data rows
  documents.forEach((doc, idx) => {
    const lineItems = (doc.lineItems as Array<{ description?: string; quantity?: number; unitPrice?: number; amount?: number }>) || [];
    const firstItem = lineItems[0] || {};

    const row = sheet.addRow({
      vendorCode: doc.vendorCode || '',
      vendorName: doc.vendorName || '',
      invoiceNumber: doc.invoiceNumber || '',
      invoiceDate: formatDate(doc.invoiceDate),
      postingDate: formatDate(doc.postingDate) || formatDate(new Date().toISOString()),
      dueDate: formatDate(doc.dueDate),
      total: doc.totalAmount || '',
      grpo: doc.grpoReference || '',
      itemCode: doc.itemCode || '',
      itemDesc: firstItem.description || doc.remarks || '',
      qty: firstItem.quantity || '',
      unitPrice: firstItem.unitPrice || '',
      discount: 0,
      taxCode: doc.taxCode || '',
      warehouse: doc.warehouse || '',
      glAccount: doc.glAccount || '',
      distRule: doc.distributionRule || '',
      projectCode: doc.projectCode || '',
      tdsCode: doc.tdsCode || '',
      rcm: doc.rcmApplicable ? 'Yes' : 'No',
      pos: doc.placeOfSupply || '',
      downPayment: doc.downPayment || '',
      rounding: doc.rounding || '',
      remarks: doc.remarks || '',
      gstin: doc.vendorGstin || '',
      taxable: doc.taxableAmount || '',
      cgst: doc.cgst || '',
      sgst: doc.sgst || '',
      igst: doc.igst || '',
      docType: doc.documentType || '',
      fileName: doc.fileName,
      confidence: doc.overallConfidence ? Math.round(doc.overallConfidence * 100) + '%' : '',
    });

    // Alternate row colors
    if (idx % 2 === 0) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF5F7FA' },
      };
    }

    // Highlight low confidence rows
    if (doc.overallConfidence != null && doc.overallConfidence < 0.6) {
      row.getCell('confidence').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEE2E2' }, // Light red
      };
    }

    row.alignment = { vertical: 'top', wrapText: false };
  });

  // Add borders to all cells
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      };
    });
  });

  // Freeze header row
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }];

  // ─── Metadata Sheet ───
  const metaSheet = workbook.addWorksheet('Export Info');
  metaSheet.columns = [
    { header: 'Field', key: 'field', width: 25 },
    { header: 'Value', key: 'value', width: 50 },
  ];

  const metaRows = [
    ['Session Name', session.name],
    ['Session ID', session.id],
    ['Export Date', new Date().toLocaleString('en-IN')],
    ['Total Documents', documents.length.toString()],
    ['App Version', APP_VERSION],
    ['Build Timestamp', BUILD_TIMESTAMP],
    ['Environment', process.env.NODE_ENV || 'production'],
  ];

  metaSheet.addRows(metaRows.map(([field, value]) => ({ field, value })));

  const metaHeader = metaSheet.getRow(1);
  metaHeader.font = { bold: true };
  metaHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEFF6FF' },
  };

  // Return as buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Generates a filename for the export
 */
export function generateExportFilename(sessionName: string): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '');
  const safeName = sessionName.replace(/[^a-zA-Z0-9\-_]/g, '_').substring(0, 30);
  return `InvoiceExport_${safeName}_${date}_${time}.xlsx`;
}
