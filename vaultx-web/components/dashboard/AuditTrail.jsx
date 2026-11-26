'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Activity, AlertCircle, Search, Filter } from 'lucide-react';
import { getAccessLogs } from '../../lib/api.js';

/**
 * AuditTrail
 * Person 4 dashboard slot: matte charcoal (#0B0C10) audit table with
 * real-time event filtering, search, auto-refresh polling, and full column schema.
 */
export function AuditTrail({ fileId, ownerToken, logs: initialLogs = null }) {
  const [logs, setLogs] = useState(Array.isArray(initialLogs) ? initialLogs : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [eventFilter, setEventFilter] = useState('ALL');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLogs = useCallback(async () => {
    if (!fileId || !ownerToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getAccessLogs(fileId, ownerToken);
      if (res && res.success && Array.isArray(res.logs)) {
        setLogs(res.logs);
      } else {
        setError(res?.message || 'Failed to retrieve access logs');
      }
    } catch (err) {
      setError(err.message || 'Failed to retrieve access logs');
    } finally {
      setLoading(false);
    }
  }, [fileId, ownerToken]);

  useEffect(() => {
    if (Array.isArray(initialLogs)) {
      setLogs(initialLogs);
      return;
    }
    if (fileId && ownerToken) {
      fetchLogs();
    }
  }, [fileId, ownerToken, initialLogs, fetchLogs]);

  // Auto-refresh interval (every 6 seconds if active)
  useEffect(() => {
    if (!autoRefresh || !fileId || !ownerToken) return;
    const interval = setInterval(() => {
      fetchLogs();
    }, 6000);
    return () => clearInterval(interval);
  }, [autoRefresh, fileId, ownerToken, fetchLogs]);

  // Filter logs by search term and event category
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const eventMatch =
        eventFilter === 'ALL' ||
        (log.event && log.event.toUpperCase().includes(eventFilter.toUpperCase()));
      if (!eventMatch) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const ip = (log.ipHash || '').toLowerCase();
      const event = (log.event || '').toLowerCase();
      const time = log.timestamp ? new Date(log.timestamp).toLocaleString().toLowerCase() : '';
      return ip.includes(q) || event.includes(q) || time.includes(q);
    });
  }, [logs, eventFilter, searchQuery]);

  return (
    <div className="audit-trail hud-glass rounded-xl border border-zinc-200 dark:border-white/10 p-4">
      {/* Top Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 dark:border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-zinc-900 dark:text-[#10B981]" />
          <h4 className="font-mono text-sm font-semibold text-zinc-900 dark:text-[#FAFAFA]">Access Audit Trail</h4>
          <span className="rounded-full border border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-white/5 px-2 py-0.5 font-mono text-[10px] text-zinc-600 dark:text-[#A1A1AA]">
            {filteredLogs.length} events
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Auto Refresh Toggle */}
          <button
            type="button"
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-xs transition-colors ${autoRefresh
              ? 'border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-300'
              : 'border-zinc-200 bg-zinc-50 text-zinc-500 hover:text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-[#71717A] dark:hover:text-[#A1A1AA]'
              }`}
            title="Toggle automatic polling every 6 seconds"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? 'bg-zinc-800 dark:bg-emerald-400 animate-pulse' : 'bg-zinc-400 dark:bg-[#71717A]'
                }`}
            />
            <span>Auto</span>
          </button>

          {fileId && ownerToken && (
            <button
              type="button"
              onClick={fetchLogs}
              disabled={loading}
              className="btn-refresh-logs inline-flex items-center gap-1.5 rounded border border-zinc-300 bg-white px-2.5 py-1 font-mono text-xs font-medium text-zinc-800 transition-colors hover:border-zinc-400 hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-white/10"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-[#71717A]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs..."
            className="w-full rounded-md border border-zinc-300 bg-white py-1.5 pl-8 pr-3 font-mono text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-white/10 dark:bg-[#07080B] dark:text-[#FAFAFA] dark:placeholder-[#71717A] dark:focus:border-[#10B981]"
          />
        </div>

        <div className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-[#07080B] px-2.5 py-1 text-xs text-zinc-700 dark:text-[#A1A1AA]">
          <Filter className="h-3 w-3 text-zinc-500 dark:text-[#71717A]" />
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            aria-label="Filter events"
            className="bg-transparent font-mono text-xs text-zinc-900 dark:text-zinc-200 focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Events</option>
            <option value="CREATED">Created</option>
            <option value="DOWNLOAD">Download</option>
            <option value="REVOKE">Revoked</option>
            <option value="BURN">Burned</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/20 p-2.5 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Table */}
      {filteredLogs.length === 0 ? (
        <p className="hud-well rounded-lg border border-white/10 py-5 text-center font-mono text-xs text-[#71717A]">
          {loading ? 'Loading audit logs...' : 'No audit events matching criteria.'}
        </p>
      ) : (
        <div className="hud-well overflow-x-auto rounded-lg border border-white/10 p-2">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 font-mono text-[11px] text-[#71717A]">
                <th className="py-2 pr-3 font-medium">Timestamp</th>
                <th className="py-2 pr-3 font-medium">Event</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">IP Hash</th>
                <th className="py-2 pr-3 font-medium">Browser</th>
                <th className="py-2 font-medium">Views Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] font-mono">
              {filteredLogs.map((entry, idx) => {
                const isDanger =
                  entry.event?.includes('REVOKE') ||
                  entry.event?.includes('FAIL') ||
                  entry.event?.includes('BURN') ||
                  entry.event?.includes('EXPIRED');

                return (
                  <tr key={`${entry.timestamp}-${idx}`} className="text-zinc-200 hover:bg-white/[0.02]">
                    <td className="py-2 pr-3 whitespace-nowrap text-[#A1A1AA]">
                      {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '-'}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span
                        className={`inline-block rounded border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${isDanger
                          ? 'border-red-500/50 bg-red-950/40 text-red-300'
                          : 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300'
                          }`}
                      >
                        {entry.event ? (entry.event.startsWith('+') ? entry.event : `+ ${entry.event}`) : '+ EVENT'}
                      </span>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={`h-2 w-2 rounded-full ${isDanger ? 'bg-red-400 shadow-[0_0_6px_#EF4444]' : 'bg-emerald-400 shadow-[0_0_6px_#10B981]'
                            }`}
                        />
                        <span className="text-[11px] text-[#71717A]">-</span>
                      </span>
                    </td>
                    <td className="py-2 pr-3 truncate max-w-[130px] text-[#71717A]" title={entry.ipHash}>
                      {entry.ipHash || 'mock-own...'}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-[#71717A]">
                      {entry.browser || entry.userAgent || '-'}
                    </td>
                    <td className="py-2 whitespace-nowrap text-[#71717A]">
                      {entry.viewsLeft != null ? entry.viewsLeft : entry.remainingDownloads != null ? entry.remainingDownloads : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AuditTrail;
