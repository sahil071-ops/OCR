'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { FileUploadZone } from '@/components/session/FileUploadZone';
import { DocumentReviewGrid } from '@/components/review/DocumentReviewGrid';
import { useToast } from '@/components/ui/Toaster';
import { formatDate } from '@/lib/utils';
import type { Session, Document } from '@/types';
import {
  ArrowLeftIcon,
  DownloadIcon,
  RefreshCwIcon,
  UploadIcon,
  ClipboardListIcon,
  PlayIcon,
} from 'lucide-react';

interface SessionPageProps {
  params: Promise<{ sessionId: string }>;
}

type TabType = 'upload' | 'review';

export default function SessionPage({ params }: SessionPageProps) {
  const { sessionId } = use(params);
  const [session, setSession] = useState<Session | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('upload');
  const [pollingActive, setPollingActive] = useState(false);
  const { toast } = useToast();

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      const data = await res.json();
      if (data.success) {
        setSession(data.data);
        setDocuments(data.data.documents || []);

        // If any docs are processing, start polling
        const hasProcessing = (data.data.documents || []).some(
          (d: Document) => d.status === 'PROCESSING' || d.status === 'PENDING'
        );
        setPollingActive(hasProcessing);
      }
    } catch {
      toast('Failed to load session', 'error');
    } finally {
      setLoading(false);
    }
  }, [sessionId, toast]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Poll for processing documents
  useEffect(() => {
    if (!pollingActive) return;
    const interval = setInterval(fetchSession, 3000);
    return () => clearInterval(interval);
  }, [pollingActive, fetchSession]);

  const handleUploadComplete = useCallback((documentId: string, fileName: string) => {
    toast(`${fileName} uploaded`, 'success');
    fetchSession();
  }, [toast, fetchSession]);

  const handleProcessAll = useCallback(async () => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/process`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast(`Processing ${data.data.started} document${data.data.started !== 1 ? 's' : ''}...`, 'success');
        setPollingActive(true);
        setActiveTab('review');
        fetchSession();
      } else {
        toast(data.error || 'Failed to start processing', 'error');
      }
    } catch {
      toast('Failed to start processing', 'error');
    } finally {
      setProcessing(false);
    }
  }, [sessionId, toast, fetchSession]);

  const handleUploadError = useCallback((fileName: string, error: string) => {
    toast(`${fileName}: ${error}`, 'error');
  }, [toast]);

  const handleDocumentUpdate = useCallback((docId: string, updates: Partial<Document>) => {
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, ...updates } : d));
  }, []);

  const handleDocumentDelete = useCallback((docId: string) => {
    setDocuments(prev => prev.filter(d => d.id !== docId));
  }, []);

  const handleExport = async () => {
    const readyCount = documents.filter(d => d.status !== 'PENDING' && d.status !== 'PROCESSING').length;
    if (readyCount === 0) {
      toast('No processed documents to export', 'warning');
      return;
    }

    setExporting(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/export`, { method: 'POST' });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const disposition = res.headers.get('Content-Disposition');
        const filename = disposition?.match(/filename="([^"]+)"/)?.[1] || 'export.xlsx';
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        toast('Export downloaded!', 'success');
        fetchSession();
      } else {
        const data = await res.json();
        toast(data.error || 'Export failed', 'error');
      }
    } catch {
      toast('Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="h-8 w-8 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Session not found</p>
        <Link href="/"><Button variant="outline" className="mt-4">Back to Sessions</Button></Link>
      </div>
    );
  }

  const pendingCount = documents.filter(d => d.status === 'PENDING').length;
  const processingCount = documents.filter(d => d.status === 'PROCESSING').length;
  const readyCount = documents.filter(d => d.status === 'EXTRACTED' || d.status === 'REVIEWED' || d.status === 'ERROR').length;

  return (
    <div className="pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">{session.name}</h1>
            <Badge variant={session.status === 'EXPORTED' ? 'success' : 'info'}>
              {session.status}
            </Badge>
            {pendingCount > 0 && processingCount === 0 && (
              <Badge variant="warning">{pendingCount} queued</Badge>
            )}
            {processingCount > 0 && (
              <Badge variant="warning">{processingCount} extracting...</Badge>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Created {formatDate(session.createdAt)} · Expires {formatDate(session.expiresAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={fetchSession} title="Refresh">
            <RefreshCwIcon className={`h-4 w-4 ${pollingActive ? 'animate-spin text-blue-500' : ''}`} />
          </Button>
          <Button
            onClick={handleExport}
            loading={exporting}
            disabled={readyCount === 0}
          >
            <DownloadIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Export Excel</span>
            <span className="sm:hidden">Export</span>
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total', value: documents.length, color: 'text-gray-900' },
          { label: 'Queued', value: pendingCount, color: 'text-amber-600' },
          { label: 'Extracting', value: processingCount, color: 'text-blue-600' },
          { label: 'Ready', value: readyCount, color: 'text-green-600' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-gray-400">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('upload')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'upload'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <UploadIcon className="h-4 w-4" />
          Upload
        </button>
        <button
          onClick={() => setActiveTab('review')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'review'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ClipboardListIcon className="h-4 w-4" />
          Review
          {documents.length > 0 && (
            <span className="bg-gray-200 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">
              {documents.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'upload' ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Upload Documents</h2>
          <p className="text-sm text-gray-500 mb-4">
            Take all your photos or upload PDFs first, then tap <strong>Process All</strong> to extract data from everything at once.
          </p>
          <FileUploadZone
            sessionId={sessionId}
            onUploadComplete={handleUploadComplete}
            onUploadError={handleUploadError}
          />
          {pendingCount > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <Button
                onClick={handleProcessAll}
                loading={processing}
                className="w-full"
              >
                <PlayIcon className="h-4 w-4" />
                Process All ({pendingCount} file{pendingCount !== 1 ? 's' : ''})
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div>
          {documents.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <ClipboardListIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No documents yet</p>
              <p className="text-sm text-gray-400 mt-1">Upload files to get started</p>
              <Button variant="outline" className="mt-4" onClick={() => setActiveTab('upload')}>
                <UploadIcon className="h-4 w-4" />
                Go to Upload
              </Button>
            </div>
          ) : (
            <DocumentReviewGrid
              documents={documents}
              onDocumentUpdate={handleDocumentUpdate}
              onDocumentDelete={handleDocumentDelete}
            />
          )}
        </div>
      )}
    </div>
  );
}
