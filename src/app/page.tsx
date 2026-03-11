'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toaster';
import { formatDate } from '@/lib/utils';
import type { Session } from '@/types';
import {
  PlusIcon,
  FolderOpenIcon,
  TrashIcon,
  FileTextIcon,
  RefreshCwIcon,
  ClockIcon,
} from 'lucide-react';

export default function HomePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      if (data.success) setSessions(data.data);
    } catch {
      toast('Failed to load sessions', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleCreate = async () => {
    if (!newSessionName.trim()) {
      toast('Please enter a session name', 'warning');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSessionName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        setNewSessionName('');
        window.location.href = `/sessions/${data.data.id}`;
      } else {
        setCreateError(data.error || 'Failed to create session');
      }
    } catch {
      setCreateError('Network error — could not reach the server');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!confirm('Delete this session and all its documents? This cannot be undone.')) return;
    setDeletingId(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast('Session deleted', 'success');
        setSessions(prev => prev.filter(s => s.id !== sessionId));
      } else {
        toast(data.error || 'Failed to delete', 'error');
      }
    } catch {
      toast('Failed to delete session', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const statusVariant = (status: Session['status']): 'success' | 'info' | 'gray' => {
    if (status === 'EXPORTED') return 'success';
    if (status === 'ACTIVE') return 'info';
    return 'gray';
  };

  const defaultName = () => {
    const now = new Date();
    return `Scan ${now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  };

  return (
    <div className="pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scan Sessions</h1>
          <p className="text-sm text-gray-500 mt-1">Upload and process invoices in sessions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={fetchSessions}>
            <RefreshCwIcon className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => {
              setNewSessionName(defaultName());
              setCreateError(null);
              setShowCreateModal(true);
            }}
          >
            <PlusIcon className="h-4 w-4" />
            <span className="hidden sm:inline">New Session</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      {/* Sessions Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <FolderOpenIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-gray-700">No sessions yet</h2>
          <p className="text-sm text-gray-400 mt-1 mb-6">Create a session to start scanning invoices</p>
          <Button onClick={() => { setNewSessionName(defaultName()); setCreateError(null); setShowCreateModal(true); }}>
            <PlusIcon className="h-4 w-4" />
            Create First Session
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map(session => (
            <div key={session.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{session.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={statusVariant(session.status)}>{session.status}</Badge>
                    <span className="text-xs text-gray-400">{session._count?.documents ?? 0} docs</span>
                  </div>
                </div>
              </div>
              <div className="space-y-1 mb-4">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <ClockIcon className="h-3.5 w-3.5" />
                  Created {formatDate(session.createdAt)}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <ClockIcon className="h-3.5 w-3.5" />
                  Expires {formatDate(session.expiresAt)}
                </div>
              </div>
              <div className="flex gap-2">
                <Link href={`/sessions/${session.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    <FileTextIcon className="h-3.5 w-3.5" />
                    Open
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(session.id)}
                  loading={deletingId === session.id}
                  className="text-red-500 hover:bg-red-50"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Session Modal */}
      <Modal open={showCreateModal} onClose={() => { setShowCreateModal(false); setCreateError(null); }} title="Create New Session" size="sm">
        <div className="p-6">
          <p className="text-sm text-gray-500 mb-4">
            A session groups invoices you want to process together in one export.
          </p>
          <label className="block text-sm font-medium text-gray-700 mb-1">Session Name</label>
          <input
            type="text"
            value={newSessionName}
            onChange={e => { setNewSessionName(e.target.value); setCreateError(null); }}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="e.g. March 2026 Invoices"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
            maxLength={100}
          />
          {createError && (
            <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{createError}</p>
          )}
          <div className="flex gap-3 mt-6">
            <Button variant="outline" onClick={() => setShowCreateModal(false)} className="flex-1">Cancel</Button>
            <Button onClick={handleCreate} loading={creating} className="flex-1">Create Session</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
