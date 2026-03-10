'use client';

import React, { useState, useCallback } from 'react';
import { cn, formatCurrency, formatDate, confidenceBg } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toaster';
import type { Document, ConfidenceData } from '@/types';
import {
  EditIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  XCircleIcon,
  CopyIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
} from 'lucide-react';

interface DocumentReviewGridProps {
  documents: Document[];
  onDocumentUpdate: (docId: string, updates: Partial<Document>) => void;
  onDocumentDelete: (docId: string) => void;
}

type FilterMode = 'all' | 'low-confidence' | 'missing' | 'reviewed' | 'error';

export function DocumentReviewGrid({ documents, onDocumentUpdate, onDocumentDelete }: DocumentReviewGridProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toast } = useToast();

  const filtered = documents.filter(doc => {
    switch (filterMode) {
      case 'low-confidence': return (doc.overallConfidence ?? 1) < 0.6;
      case 'missing': return !doc.vendorCode || !doc.invoiceNumber || !doc.totalAmount;
      case 'reviewed': return doc.status === 'REVIEWED';
      case 'error': return doc.status === 'ERROR';
      default: return true;
    }
  });

  const counts = {
    all: documents.length,
    'low-confidence': documents.filter(d => (d.overallConfidence ?? 1) < 0.6).length,
    missing: documents.filter(d => !d.vendorCode || !d.invoiceNumber || !d.totalAmount).length,
    reviewed: documents.filter(d => d.status === 'REVIEWED').length,
    error: documents.filter(d => d.status === 'ERROR').length,
  };

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(counts) as FilterMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setFilterMode(mode)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              filterMode === mode
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {mode === 'all' ? 'All' :
             mode === 'low-confidence' ? 'Low Confidence' :
             mode === 'missing' ? 'Missing Fields' :
             mode === 'reviewed' ? 'Reviewed' : 'Errors'}
            <span className={cn(
              'px-1.5 py-0.5 rounded-full text-xs',
              filterMode === mode ? 'bg-blue-700' : 'bg-gray-200 text-gray-500'
            )}>
              {counts[mode]}
            </span>
          </button>
        ))}
      </div>

      {/* Document List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <CheckCircleIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No documents match this filter</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(doc => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              isExpanded={expandedId === doc.id}
              onToggleExpand={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
              onEdit={() => setEditingId(doc.id)}
              onDelete={() => onDocumentDelete(doc.id)}
              onUpdate={onDocumentUpdate}
              toast={toast}
            />
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editingId && (
        <EditDocumentModal
          doc={documents.find(d => d.id === editingId)!}
          onClose={() => setEditingId(null)}
          onSave={(updates) => {
            onDocumentUpdate(editingId, updates);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Document Row
// ─────────────────────────────────────────────

interface DocumentRowProps {
  doc: Document;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: (docId: string, updates: Partial<Document>) => void;
  toast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

function DocumentRow({ doc, isExpanded, onToggleExpand, onEdit, onDelete, onUpdate, toast }: DocumentRowProps) {
  const [deleting, setDeleting] = useState(false);
  const [markingReviewed, setMarkingReviewed] = useState(false);

  const statusIcon = () => {
    if (doc.status === 'ERROR') return <XCircleIcon className="h-4 w-4 text-red-500" />;
    if (doc.status === 'PROCESSING') return (
      <svg className="h-4 w-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    );
    if (doc.status === 'REVIEWED') return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
    if (doc.isDuplicate) return <CopyIcon className="h-4 w-4 text-yellow-500" />;
    if ((doc.overallConfidence ?? 1) < 0.6) return <AlertTriangleIcon className="h-4 w-4 text-yellow-500" />;
    return <CheckCircleIcon className="h-4 w-4 text-gray-300" />;
  };

  const handleDelete = async () => {
    if (!confirm('Delete this document?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        onDelete();
        toast('Document deleted', 'success');
      } else {
        toast(data.error || 'Failed to delete', 'error');
      }
    } catch {
      toast('Failed to delete document', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleMarkReviewed = async () => {
    setMarkingReviewed(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'REVIEWED' }),
      });
      const data = await res.json();
      if (data.success) {
        onUpdate(doc.id, { status: 'REVIEWED', reviewedAt: data.data.reviewedAt });
        toast('Marked as reviewed', 'success');
      }
    } catch {
      toast('Failed to update', 'error');
    } finally {
      setMarkingReviewed(false);
    }
  };

  const confidence = doc.overallConfidence;
  const confidenceData = doc.confidenceData as ConfidenceData | null;

  return (
    <div className={cn(
      'bg-white rounded-xl border transition-all',
      doc.isDuplicate ? 'border-yellow-300' :
      doc.status === 'ERROR' ? 'border-red-300' :
      doc.status === 'REVIEWED' ? 'border-green-200' :
      'border-gray-200'
    )}>
      {/* Row Header */}
      <div className="flex items-center gap-3 p-4">
        <div className="flex-shrink-0">{statusIcon()}</div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-gray-900 truncate max-w-xs">
              {doc.vendorName || doc.fileName}
            </span>
            {doc.isDuplicate && <Badge variant="warning">Duplicate</Badge>}
            {doc.documentType !== 'UNKNOWN' && (
              <Badge variant="gray">{doc.documentType?.replace(/_/g, ' ')}</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-gray-500">{doc.invoiceNumber || 'No invoice #'}</span>
            <span className="text-xs text-gray-400">{formatDate(doc.invoiceDate)}</span>
            {doc.totalAmount && (
              <span className="text-xs font-medium text-gray-700">{formatCurrency(doc.totalAmount)}</span>
            )}
          </div>
        </div>

        {/* Confidence + Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <ConfidenceBadge score={confidence} />
          {doc.status !== 'REVIEWED' && doc.status !== 'PROCESSING' && doc.status !== 'PENDING' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkReviewed}
              loading={markingReviewed}
              title="Mark as reviewed"
            >
              <CheckCircleIcon className="h-4 w-4 text-green-500" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onEdit} title="Edit">
            <EditIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            loading={deleting}
            className="text-red-400 hover:bg-red-50"
            title="Delete"
          >
            <XCircleIcon className="h-4 w-4" />
          </Button>
          <button onClick={onToggleExpand} className="p-1 text-gray-400 hover:text-gray-600">
            {isExpanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-gray-100 p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              ['Vendor Code', doc.vendorCode, confidenceData?.vendorCode?.score],
              ['GSTIN', doc.vendorGstin, confidenceData?.vendorGstin?.score],
              ['Invoice #', doc.invoiceNumber, confidenceData?.invoiceNumber?.score],
              ['Invoice Date', formatDate(doc.invoiceDate), confidenceData?.invoiceDate?.score],
              ['Due Date', formatDate(doc.dueDate), null],
              ['Place of Supply', doc.placeOfSupply, confidenceData?.placeOfSupply?.score],
              ['Taxable Amount', doc.taxableAmount != null ? formatCurrency(doc.taxableAmount) : null, confidenceData?.taxableAmount?.score],
              ['CGST', doc.cgst != null ? formatCurrency(doc.cgst) : null, null],
              ['SGST', doc.sgst != null ? formatCurrency(doc.sgst) : null, null],
              ['IGST', doc.igst != null ? formatCurrency(doc.igst) : null, null],
              ['Total', doc.totalAmount != null ? formatCurrency(doc.totalAmount) : null, confidenceData?.totalAmount?.score],
              ['G/L Account', doc.glAccount, confidenceData?.glAccount?.score],
              ['Tax Code', doc.taxCode, confidenceData?.taxCode?.score],
              ['TDS Code', doc.tdsCode, null],
              ['Distribution Rule', doc.distributionRule, null],
              ['Remarks', doc.remarks, null],
            ].map(([label, value, conf]) => (
              <div key={label as string} className="space-y-0.5">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">{label}</span>
                  {conf != null && <ConfidenceBadge score={conf as number} showLabel={false} />}
                </div>
                <span className={cn(
                  'text-xs font-medium block',
                  !value ? 'text-gray-300 italic' : 'text-gray-800'
                )}>
                  {(value as string) || 'Not set'}
                </span>
              </div>
            ))}
          </div>

          {doc.status === 'ERROR' && doc.processingError && (
            <div className="mt-3 p-3 bg-red-50 rounded-lg text-xs text-red-600">
              <strong>Error:</strong> {doc.processingError}
            </div>
          )}

          {doc.status === 'PROCESSING' && (
            <div className="mt-3 flex items-center gap-2 text-xs text-blue-600">
              <ClockIcon className="h-3.5 w-3.5 animate-pulse" />
              Extraction in progress — refresh to see results
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Edit Modal
// ─────────────────────────────────────────────

interface EditDocumentModalProps {
  doc: Document;
  onClose: () => void;
  onSave: (updates: Partial<Document>) => void;
}

function EditDocumentModal({ doc, onClose, onSave }: EditDocumentModalProps) {
  const [form, setForm] = useState({
    vendorName: doc.vendorName || '',
    vendorCode: doc.vendorCode || '',
    vendorGstin: doc.vendorGstin || '',
    invoiceNumber: doc.invoiceNumber || '',
    invoiceDate: doc.invoiceDate || '',
    dueDate: doc.dueDate || '',
    totalAmount: doc.totalAmount?.toString() || '',
    taxableAmount: doc.taxableAmount?.toString() || '',
    placeOfSupply: doc.placeOfSupply || '',
    glAccount: doc.glAccount || '',
    taxCode: doc.taxCode || '',
    tdsCode: doc.tdsCode || '',
    distributionRule: doc.distributionRule || '',
    projectCode: doc.projectCode || '',
    warehouse: doc.warehouse || '',
    grpoReference: doc.grpoReference || '',
    rcmApplicable: doc.rcmApplicable ? 'yes' : 'no',
    remarks: doc.remarks || '',
    documentType: doc.documentType || 'UNKNOWN',
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Partial<Document> = {
        vendorName: form.vendorName || undefined,
        vendorCode: form.vendorCode || undefined,
        vendorGstin: form.vendorGstin || undefined,
        invoiceNumber: form.invoiceNumber || undefined,
        invoiceDate: form.invoiceDate || undefined,
        dueDate: form.dueDate || undefined,
        totalAmount: form.totalAmount ? parseFloat(form.totalAmount) : undefined,
        taxableAmount: form.taxableAmount ? parseFloat(form.taxableAmount) : undefined,
        placeOfSupply: form.placeOfSupply || undefined,
        glAccount: form.glAccount || undefined,
        taxCode: form.taxCode || undefined,
        tdsCode: form.tdsCode || undefined,
        distributionRule: form.distributionRule || undefined,
        projectCode: form.projectCode || undefined,
        warehouse: form.warehouse || undefined,
        grpoReference: form.grpoReference || undefined,
        rcmApplicable: form.rcmApplicable === 'yes',
        remarks: form.remarks || undefined,
        documentType: form.documentType as Document['documentType'],
        status: 'REVIEWED',
      };

      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.success) {
        onSave({ ...updates, ...data.data });
        toast('Document updated', 'success');
        onClose();
      } else {
        toast(data.error || 'Failed to save', 'error');
      }
    } catch {
      toast('Failed to save changes', 'error');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof form, type = 'text') => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );

  return (
    <Modal open title={`Edit: ${doc.fileName}`} onClose={onClose} size="xl">
      <div className="p-6 space-y-6">
        {/* Extracted Fields */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Extracted Fields</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field('Vendor Name', 'vendorName')}
            {field('Vendor GSTIN', 'vendorGstin')}
            {field('Invoice Number', 'invoiceNumber')}
            {field('Invoice Date', 'invoiceDate', 'date')}
            {field('Due Date', 'dueDate', 'date')}
            {field('Total Amount', 'totalAmount', 'number')}
            {field('Taxable Amount', 'taxableAmount', 'number')}
            {field('Place of Supply', 'placeOfSupply')}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Document Type</label>
              <select
                value={form.documentType}
                onChange={e => setForm(prev => ({ ...prev, documentType: e.target.value as Document['documentType'] }))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {['TAX_INVOICE', 'SERVICE_INVOICE', 'FREIGHT', 'CREDIT_NOTE', 'DEBIT_NOTE', 'BILL', 'UNKNOWN'].map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Accounting Fields */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Accounting Fields</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field('Vendor Code', 'vendorCode')}
            {field('G/L Account', 'glAccount')}
            {field('Tax Code', 'taxCode')}
            {field('TDS Code', 'tdsCode')}
            {field('Distribution Rule', 'distributionRule')}
            {field('Project Code', 'projectCode')}
            {field('Warehouse', 'warehouse')}
            {field('GRPO Reference', 'grpoReference')}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">RCM Applicable</label>
              <select
                value={form.rcmApplicable}
                onChange={e => setForm(prev => ({ ...prev, rcmApplicable: e.target.value }))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Remarks */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
          <textarea
            value={form.remarks}
            onChange={e => setForm(prev => ({ ...prev, remarks: e.target.value }))}
            rows={2}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} loading={saving} className="flex-1">Save Changes</Button>
        </div>
      </div>
    </Modal>
  );
}
