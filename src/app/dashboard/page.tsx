'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { CheckCircle2, Clock, FileText, AlertCircle, TrendingUp, Plus } from 'lucide-react';
import ProgressBar from '@/components/ui/ProgressBar';
import type { DashboardStats, Document } from '@/lib/types';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getFileIcon(fileType: string): string {
  if (fileType === 'application/pdf') return '📄';
  if (fileType.startsWith('image/')) return '🖼️';
  return '📎';
}

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  description?: string;
  colorClass: string;
  bgClass: string;
}

function StatCard({ title, value, icon, description, colorClass, bgClass }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <div className={`${bgClass} ${colorClass} p-2 rounded-lg`}>{icon}</div>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
    </div>
  );
}

interface RecentDocumentRowProps {
  document: Document;
}

function RecentDocumentRow({ document }: RecentDocumentRowProps) {
  return (
    <div className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-2xl flex-shrink-0">{getFileIcon(document.fileType)}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{document.filename}</p>
          <p className="text-xs text-gray-500">{formatFileSize(document.fileSize)}</p>
        </div>
      </div>
      <div className="flex-shrink-0 ml-4">
        <p className="text-xs text-gray-400">{formatDate(document.uploadedAt)}</p>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 bg-gray-200 rounded w-24" />
        <div className="h-9 w-9 bg-gray-200 rounded-lg" />
      </div>
      <div className="h-8 bg-gray-200 rounded w-16 mb-1" />
      <div className="h-3 bg-gray-200 rounded w-32" />
    </div>
  );
}

export default function DashboardPage() {
  const { getToken } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDashboardStats() {
      try {
        setLoading(true);
        setError(null);
        const token = await getToken();
        const response = await fetch('/api/dashboard', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          throw new Error(`Failed to load dashboard data (${response.status})`);
        }
        const data: DashboardStats = await response.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardStats();
  }, [getToken]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">PCS Dashboard</h1>
          <p className="text-gray-500 mt-1">Track your Permanent Change of Station progress</p>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Failed to load dashboard</p>
              <p className="text-sm text-red-600 mt-0.5">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-2 text-sm font-medium text-red-700 underline hover:text-red-800"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : stats ? (
            <>
              <StatCard
                title="Total Tasks"
                value={stats.totalTasks}
                icon={<Clock className="h-5 w-5" />}
                description={`${stats.activeTasks} still active`}
                colorClass="text-blue-600"
                bgClass="bg-blue-50"
              />
              <StatCard
                title="Completed"
                value={stats.completedTasks}
                icon={<CheckCircle2 className="h-5 w-5" />}
                description="Tasks finished"
                colorClass="text-green-600"
                bgClass="bg-green-50"
              />
              <StatCard
                title="Active Tasks"
                value={stats.activeTasks}
                icon={<TrendingUp className="h-5 w-5" />}
                description="Remaining to do"
                colorClass="text-amber-600"
                bgClass="bg-amber-50"
              />
              <StatCard
                title="Documents"
                value={stats.totalDocuments}
                icon={<FileText className="h-5 w-5" />}
                description="Uploaded files"
                colorClass="text-purple-600"
                bgClass="bg-purple-50"
              />
            </>
          ) : null}
        </div>

        {/* Progress Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Progress Card */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Overall Progress</h2>
                <p className="text-sm text-gray-500 mt-0.5">Your PCS move completion status</p>
              </div>
              {!loading && stats && (
                <span className="text-2xl font-bold text-gray-900">
                  {stats.completionPercentage}%
                </span>
              )}
            </div>

            {loading ? (
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded-full w-full mb-4" />
                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div className="h-16 bg-gray-200 rounded-lg" />
                  <div className="h-16 bg-gray-200 rounded-lg" />
                  <div className="h-16 bg-gray-200 rounded-lg" />
                </div>
              </div>
            ) : stats ? (
              <>
                <ProgressBar
                  percentage={stats.completionPercentage}
                  showLabel={false}
                  height="lg"
                />

                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-gray-900">{stats.totalTasks}</p>
                    <p className="text-xs text-gray-500 mt-1">Total Tasks</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-green-700">{stats.completedTasks}</p>
                    <p className="text-xs text-green-600 mt-1">Completed</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-amber-700">{stats.activeTasks}</p>
                    <p className="text-xs text-amber-600 mt-1">Remaining</p>
                  </div>
                </div>

                {stats.totalTasks === 0 && (
                  <div className="mt-6 text-center py-4">
                    <p className="text-gray-500 text-sm mb-3">No tasks yet. Get started!</p>
                    <Link
                      href="/tasks"
                      className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      Add Your First Task
                    </Link>
                  </div>
                )}

                {stats.completionPercentage === 100 && stats.totalTasks > 0 && (
                  <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                    <p className="text-green-800 font-medium">🎉 All tasks complete! Great work!</p>
                  </div>
                )}
              </>
            ) : null}

            {!loading && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <Link
                  href="/tasks"
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  View all tasks →
                </Link>
              </div>
            )}
          </div>

          {/* Recent Documents Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Recent Documents</h2>
                <p className="text-sm text-gray-500 mt-0.5">Latest uploads</p>
              </div>
              <FileText className="h-5 w-5 text-gray-400" />
            </div>

            {loading ? (
              <div className="space-y-3 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <div className="h-8 w-8 bg-gray-200 rounded" />
                    <div className="flex-1">
                      <div className="h-3 bg-gray-200 rounded w-3/4 mb-1" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : stats && stats.recentDocuments.length > 0 ? (
              <div className="space-y-1 -mx-2">
                {stats.recentDocuments.map((doc) => (
                  <RecentDocumentRow key={doc.id} document={doc} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="h-10 w-10 text-gray-300 mb-3" />
                <p className="text-sm text-gray-500 mb-1">No documents yet</p>
                <p className="text-xs text-gray-400">Upload PCS documents to get started</p>
              </div>
            )}

            {!loading && (
              <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
                <Link
                  href="/documents"
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  View all documents →
                </Link>
                <Link
                  href="/documents"
                  className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Upload
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/tasks"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add New Task
            </Link>
            <Link
              href="/documents"
              className="inline-flex items-center gap-2 bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <FileText className="h-4 w-4" />
              Upload Document
            </Link>
            <Link
              href="/tasks?filter=active"
              className="inline-flex items-center gap-2 bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <Clock className="h-4 w-4" />
              View Active Tasks
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}