'use client';

import React, { useCallback, useRef, useState } from 'react';
import { cn, formatFileSize } from '@/lib/utils';
import { UploadCloudIcon, CameraIcon, XIcon, FileTextIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface PendingFile {
  id: string;
  file: File;
  preview?: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  documentId?: string;
}

interface FileUploadZoneProps {
  sessionId: string;
  onUploadComplete: (documentId: string, fileName: string) => void;
  onUploadError: (fileName: string, error: string) => void;
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];
const ACCEPTED_EXT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif';
const MAX_SIZE_MB = 20;

export function FileUploadZone({ sessionId, onUploadComplete, onUploadError }: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles: PendingFile[] = [];

    for (const file of fileArray) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        onUploadError(file.name, `Unsupported file type: ${file.type}`);
        continue;
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        onUploadError(file.name, `File too large (max ${MAX_SIZE_MB}MB)`);
        continue;
      }
      const id = Math.random().toString(36).slice(2);
      let preview: string | undefined;
      if (file.type.startsWith('image/')) {
        preview = URL.createObjectURL(file);
      }
      validFiles.push({ id, file, preview, status: 'pending' });
    }

    if (validFiles.length > 0) {
      setPendingFiles(prev => [...prev, ...validFiles]);
      // Start uploading immediately
      validFiles.forEach(pf => uploadFile(pf));
    }
  }, [sessionId]); // eslint-disable-line

  const uploadFile = async (pf: PendingFile) => {
    setUploadingCount(c => c + 1);
    setPendingFiles(prev => prev.map(f => f.id === pf.id ? { ...f, status: 'uploading' } : f));

    try {
      const formData = new FormData();
      formData.append('file', pf.file);
      formData.append('sessionId', sessionId);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.success) {
        setPendingFiles(prev => prev.map(f =>
          f.id === pf.id ? { ...f, status: 'done', documentId: data.data.documentId } : f
        ));
        onUploadComplete(data.data.documentId, pf.file.name);
      } else {
        const errorMsg = data.error || 'Upload failed';
        setPendingFiles(prev => prev.map(f =>
          f.id === pf.id ? { ...f, status: 'error', error: errorMsg } : f
        ));
        onUploadError(pf.file.name, errorMsg);
      }
    } catch (err) {
      const errorMsg = 'Network error during upload';
      setPendingFiles(prev => prev.map(f =>
        f.id === pf.id ? { ...f, status: 'error', error: errorMsg } : f
      ));
      onUploadError(pf.file.name, errorMsg);
    } finally {
      setUploadingCount(c => c - 1);
    }
  };

  const removeFile = (id: string) => {
    setPendingFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.preview) URL.revokeObjectURL(file.preview);
      return prev.filter(f => f.id !== id);
    });
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer',
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/50'
        )}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadCloudIcon className={cn('h-10 w-10 mx-auto mb-3', isDragging ? 'text-blue-500' : 'text-gray-400')} />
        <p className="font-medium text-gray-700 text-sm">Drop files here or tap to browse</p>
        <p className="text-xs text-gray-400 mt-1">PDF, JPEG, PNG, WebP, HEIC — max {MAX_SIZE_MB}MB each</p>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloudIcon className="h-4 w-4" />
          Browse Files
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => cameraInputRef.current?.click()}
        >
          <CameraIcon className="h-4 w-4" />
          Take Photo
        </Button>
      </div>

      {/* Hidden Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXT}
        className="hidden"
        onChange={e => e.target.files && addFiles(e.target.files)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => e.target.files && addFiles(e.target.files)}
      />

      {/* Upload Queue */}
      {pendingFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Upload Queue ({pendingFiles.length})
          </p>
          {pendingFiles.map(pf => (
            <div
              key={pf.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border text-sm',
                pf.status === 'done' ? 'bg-green-50 border-green-200' :
                pf.status === 'error' ? 'bg-red-50 border-red-200' :
                pf.status === 'uploading' ? 'bg-blue-50 border-blue-200' :
                'bg-gray-50 border-gray-200'
              )}
            >
              {/* Thumbnail or Icon */}
              <div className="flex-shrink-0 w-8 h-8 rounded overflow-hidden bg-gray-100 flex items-center justify-center">
                {pf.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pf.preview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <FileTextIcon className="h-4 w-4 text-gray-400" />
                )}
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="truncate text-gray-700 font-medium">{pf.file.name}</p>
                <p className="text-xs text-gray-400">
                  {formatFileSize(pf.file.size)} •{' '}
                  {pf.status === 'uploading' && <span className="text-blue-600">Uploading...</span>}
                  {pf.status === 'done' && <span className="text-green-600">Uploaded — extracting...</span>}
                  {pf.status === 'error' && <span className="text-red-600">{pf.error}</span>}
                  {pf.status === 'pending' && <span className="text-gray-400">Waiting...</span>}
                </p>
              </div>

              {/* Remove button */}
              {pf.status !== 'uploading' && (
                <button onClick={() => removeFile(pf.id)} className="text-gray-400 hover:text-gray-600">
                  <XIcon className="h-4 w-4" />
                </button>
              )}

              {/* Progress spinner */}
              {pf.status === 'uploading' && (
                <svg className="h-4 w-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
