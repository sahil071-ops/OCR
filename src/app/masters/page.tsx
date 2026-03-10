'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toaster';
import type { Vendor } from '@/types';
import {
  PlusIcon,
  UploadIcon,
  DownloadIcon,
  SearchIcon,
  EditIcon,
  DatabaseIcon,
  RefreshCwIcon,
} from 'lucide-react';

export default function MastersPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchVendors = useCallback(async (searchStr = search, page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search: searchStr, page: page.toString(), pageSize: '30' });
      const res = await fetch(`/api/masters/vendors?${params}`);
      const data = await res.json();
      if (data.success) {
        setVendors(data.data);
        setMeta(data.meta);
      }
    } catch {
      toast('Failed to load vendors', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => {
    const t = setTimeout(() => fetchVendors(search, 1), 300);
    return () => clearTimeout(t);
  }, [search, fetchVendors]);

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', 'upsert');
      const res = await fetch('/api/masters/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        toast(data.message, 'success');
        setImportModalOpen(false);
        fetchVendors();
      } else {
        toast(data.error || 'Import failed', 'error');
      }
    } catch {
      toast('Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleDownload = () => {
    window.open('/api/masters/export', '_blank');
  };

  return (
    <div className="pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendor Masters</h1>
          <p className="text-sm text-gray-500 mt-1">{meta.total} vendors</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchVendors()}>
            <RefreshCwIcon className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <DownloadIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Download</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportModalOpen(true)}>
            <UploadIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Import CSV</span>
          </Button>
          <Button size="sm" onClick={() => setAddModalOpen(true)}>
            <PlusIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Add Vendor</span>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, code, or GSTIN..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Vendor Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : vendors.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <DatabaseIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-gray-700">No vendors yet</h2>
          <p className="text-sm text-gray-400 mt-1 mb-6">
            Import a CSV file or add vendors manually
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => setImportModalOpen(true)}>
              <UploadIcon className="h-4 w-4" />
              Import CSV
            </Button>
            <Button onClick={() => setAddModalOpen(true)}>
              <PlusIcon className="h-4 w-4" />
              Add Vendor
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Vendor Code', 'Vendor Name', 'GSTIN', 'G/L Account', 'Tax Code', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vendors.map(vendor => (
                  <tr key={vendor.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{vendor.vendorCode}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{vendor.vendorName}</div>
                      {vendor.aliases && vendor.aliases.length > 0 && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          Also: {vendor.aliases.map(a => a.alias).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{vendor.gstin || '-'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{vendor.defaultGlAccount || '-'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{vendor.defaultTaxCode || '-'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={vendor.active ? 'success' : 'gray'}>
                        {vendor.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" onClick={() => setEditingVendor(vendor)}>
                        <EditIcon className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {vendors.map(vendor => (
              <div key={vendor.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{vendor.vendorName}</div>
                    <div className="text-xs text-gray-400 font-mono mt-0.5">{vendor.vendorCode}</div>
                    {vendor.gstin && <div className="text-xs text-gray-400 mt-0.5">{vendor.gstin}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={vendor.active ? 'success' : 'gray'}>
                      {vendor.active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => setEditingVendor(vendor)}>
                      <EditIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">
                Page {meta.page} of {meta.totalPages} ({meta.total} total)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={meta.page <= 1}
                  onClick={() => fetchVendors(search, meta.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => fetchVendors(search, meta.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import Modal */}
      <Modal open={importModalOpen} onClose={() => setImportModalOpen(false)} title="Import Vendor Master" size="sm">
        <div className="p-6">
          <p className="text-sm text-gray-500 mb-4">
            Upload a CSV or Excel file. Existing vendors will be updated (upsert).
          </p>
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 mb-4">
            <strong>Required columns:</strong> vendorCode, vendorName<br />
            <strong>Optional:</strong> gstin, panNumber, defaultGlAccount, defaultTaxCode, defaultTdsCode,
            defaultDistRule, placeOfSupply, aliases (comma-separated), active
          </div>
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Click to select CSV or XLSX file</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleImport(e.target.files[0])}
          />
          {importing && (
            <div className="mt-3 text-sm text-blue-600 text-center">Importing...</div>
          )}
          <Button variant="outline" onClick={() => setImportModalOpen(false)} className="w-full mt-4">
            Cancel
          </Button>
        </div>
      </Modal>

      {/* Add/Edit Vendor Modal */}
      {(addModalOpen || editingVendor) && (
        <VendorFormModal
          vendor={editingVendor || undefined}
          onClose={() => { setAddModalOpen(false); setEditingVendor(null); }}
          onSave={() => { setAddModalOpen(false); setEditingVendor(null); fetchVendors(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Vendor Form Modal
// ─────────────────────────────────────────────

interface VendorFormModalProps {
  vendor?: Vendor;
  onClose: () => void;
  onSave: () => void;
}

function VendorFormModal({ vendor, onClose, onSave }: VendorFormModalProps) {
  const [form, setForm] = useState({
    vendorCode: vendor?.vendorCode || '',
    vendorName: vendor?.vendorName || '',
    gstin: vendor?.gstin || '',
    panNumber: vendor?.panNumber || '',
    defaultGlAccount: vendor?.defaultGlAccount || '',
    defaultTaxCode: vendor?.defaultTaxCode || '',
    defaultTdsCode: vendor?.defaultTdsCode || '',
    defaultDistRule: vendor?.defaultDistRule || '',
    placeOfSupply: vendor?.placeOfSupply || '',
    defaultItemType: vendor?.defaultItemType || '',
    defaultRemarks: vendor?.defaultRemarks || '',
    active: vendor?.active !== false,
    aliasInput: '',
    aliases: vendor?.aliases?.map(a => a.alias) || [],
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!form.vendorCode || !form.vendorName) {
      toast('Vendor code and name are required', 'warning');
      return;
    }
    setSaving(true);
    try {
      const url = vendor ? `/api/masters/vendors/${vendor.id}` : '/api/masters/vendors';
      const method = vendor ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorCode: form.vendorCode,
          vendorName: form.vendorName,
          gstin: form.gstin || null,
          panNumber: form.panNumber || null,
          defaultGlAccount: form.defaultGlAccount || null,
          defaultTaxCode: form.defaultTaxCode || null,
          defaultTdsCode: form.defaultTdsCode || null,
          defaultDistRule: form.defaultDistRule || null,
          placeOfSupply: form.placeOfSupply || null,
          defaultItemType: form.defaultItemType || null,
          defaultRemarks: form.defaultRemarks || null,
          active: form.active,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast(vendor ? 'Vendor updated' : 'Vendor created', 'success');
        onSave();
      } else {
        toast(data.error || 'Failed to save', 'error');
      }
    } catch {
      toast('Failed to save vendor', 'error');
    } finally {
      setSaving(false);
    }
  };

  const f = (label: string, key: keyof typeof form, type = 'text') => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={form[key] as string}
        onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );

  return (
    <Modal open title={vendor ? `Edit: ${vendor.vendorName}` : 'Add Vendor'} onClose={onClose} size="lg">
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {f('Vendor Code *', 'vendorCode')}
          {f('Vendor Name *', 'vendorName')}
          {f('GSTIN', 'gstin')}
          {f('PAN Number', 'panNumber')}
          {f('Default G/L Account', 'defaultGlAccount')}
          {f('Default Tax Code', 'defaultTaxCode')}
          {f('Default TDS Code', 'defaultTdsCode')}
          {f('Default Distribution Rule', 'defaultDistRule')}
          {f('Place of Supply', 'placeOfSupply')}
          {f('Default Item Type', 'defaultItemType')}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Default Remarks</label>
          <input
            type="text"
            value={form.defaultRemarks}
            onChange={e => setForm(prev => ({ ...prev, defaultRemarks: e.target.value }))}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="active"
            checked={form.active}
            onChange={e => setForm(prev => ({ ...prev, active: e.target.checked }))}
            className="rounded border-gray-300"
          />
          <label htmlFor="active" className="text-sm text-gray-700">Active</label>
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} loading={saving} className="flex-1">
            {vendor ? 'Save Changes' : 'Add Vendor'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
