'use client';

import React, { useEffect, useState } from 'react';
import { APP_VERSION, BUILD_TIMESTAMP, RELEASE_NOTES, APP_ENVIRONMENT } from '@/lib/version';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { InfoIcon, RefreshCwIcon, CheckCircleIcon, ScanIcon } from 'lucide-react';

interface HealthData {
  version: string;
  buildTimestamp: string;
  releaseNotes: string;
  environment: string;
}

export default function AboutPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [pwaInstallable, setPwaInstallable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);

  useEffect(() => {
    // Check if PWA install prompt is available
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setPwaInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const checkServerVersion = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkServerVersion();
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (deferredPrompt as any).prompt();
    setDeferredPrompt(null);
    setPwaInstallable(false);
  };

  const infoRows = [
    { label: 'App Version', value: APP_VERSION },
    { label: 'Build Date', value: new Date(BUILD_TIMESTAMP).toLocaleString('en-IN') },
    { label: 'Environment', value: APP_ENVIRONMENT },
    { label: 'Release Notes', value: RELEASE_NOTES },
  ];

  return (
    <div className="max-w-2xl pb-24 md:pb-6">
      <div className="flex items-center gap-3 mb-6">
        <ScanIcon className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoice Scanner</h1>
          <p className="text-sm text-gray-500">AI-powered invoice data extraction</p>
        </div>
      </div>

      {/* Version Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <InfoIcon className="h-4 w-4" />
          Version Information
        </h2>
        <div className="space-y-3">
          {infoRows.map(row => (
            <div key={row.label} className="flex items-start justify-between gap-4">
              <span className="text-sm text-gray-500 w-32 flex-shrink-0">{row.label}</span>
              <span className="text-sm font-medium text-gray-900 text-right font-mono">{row.value}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Server version</p>
              <p className="text-sm font-mono text-gray-700">{health?.version || 'Checking...'}</p>
            </div>
            {health && health.version === APP_VERSION && (
              <Badge variant="success">
                <CheckCircleIcon className="h-3 w-3 mr-1" />
                Up to date
              </Badge>
            )}
            {health && health.version !== APP_VERSION && (
              <Badge variant="warning">Update available</Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={checkServerVersion}
            loading={loading}
          >
            <RefreshCwIcon className="h-3.5 w-3.5" />
            Check for updates
          </Button>
        </div>
      </div>

      {/* PWA Install */}
      {pwaInstallable && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-4">
          <h2 className="text-sm font-semibold text-blue-800 mb-2">Install as App</h2>
          <p className="text-sm text-blue-700 mb-3">
            Install Invoice Scanner on your device for a better experience and easy access from your home screen.
          </p>
          <Button onClick={handleInstall}>Install App</Button>
        </div>
      )}

      {/* How it works */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">How It Works</h2>
        <ol className="space-y-3">
          {[
            'Create a scan session for a batch of invoices',
            'Upload PDFs or take photos using your phone/tablet camera',
            'AI extracts vendor name, GSTIN, invoice number, amounts, tax details',
            'Master data matching fills in vendor codes and accounting fields',
            'Review extracted data, correct any errors',
            'Export to Excel in the standard AP entry format',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex-shrink-0 h-5 w-5 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <span className="text-sm text-gray-700">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Supported Documents */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Supported Documents</h2>
        <div className="flex flex-wrap gap-2">
          {[
            'Tax Invoices', 'Service Invoices', 'Freight / Transport',
            'Credit Notes', 'Debit Notes', 'Scanned PDFs', 'Photos (JPEG/PNG)',
            'HEIC (iPhone photos)',
          ].map(doc => (
            <Badge key={doc} variant="gray">{doc}</Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
