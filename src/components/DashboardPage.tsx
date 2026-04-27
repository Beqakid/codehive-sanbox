'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, CheckCircle, Clock, TrendingUp, AlertCircle, ChevronRight, RefreshCw } from 'lucide-react';
import ProgressBar from './ProgressBar';
import { DashboardStats, Document } from '../lib/types';

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const getFileIcon = (fileType: string): string => {
  if (fileType === 'application/pdf') return '📄';
  if (fileType.startsWith('image/')) return '🖼️';
  return '📎';
};

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, bgColor, subtitle }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-start gap-4 hover:shadow-md transition-shadow duration-200">
    <div className={`${bgColor} p-3 rounded-lg flex-shrink-0`}>
      <div className={color}>{icon}</div>
    </div>
    <div className="min-w-0">
      <p className="text-sm font-medium text-gray-500 truncate">{title}</p>
      <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

interface RecentDocumentRowProps {
  document: Document;
}

const RecentDocumentRow: React.FC<RecentDocumentRowProps> = ({ document }) => (
  <div className="flex items-center gap-3 py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors duration-150 group">
    <span className="text-2xl flex-shrink-0">{getFileIcon(document.fileType)}</span>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-gray-800 truncate">{document.filename}</p>
      <p className="text-xs text-gray-400 mt-0.5">
        {formatDate(document.uploadedAt)} &middot; {formatFileSize(document.fileSize)}
      </p>
    </div>
    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0 transition-colors" />
  </div>
);

const SkeletonStatCard: React.FC = () => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-start gap-4 animate-pulse">
    <div className="bg-gray-200 p-3 rounded-lg w-12 h-12 flex-shrink-0" />
    <div className="flex-1">
      <div className="h-3 bg-gray-200 rounded w-24 mb-2" />
      <div className="h-7 bg-gray-200 rounded w-16" />
    </div>
  </div>
);

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchStats = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch('/api/dashboard');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to load dashboard data (${response.status})`);
      }
      const data: DashboardStats = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const getCompletionMessage = (percentage: number): string => {
    if (percentage === 0) return 'Get started by completing your first task!';
    if (percentage < 25) return 'Great start — keep the momentum going!';
    if (percentage < 50) return "You're making progress — stay focused!";
    if (percentage < 75) return "Halfway there — you're doing great!";
    if (percentage < 100) return 'Almost done — the finish line is in sight!';
    return '🎉 All tasks complete — mission accomplished!';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">PCS Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Track your relocation progress at a glance</p>
          </div>
          <button
            onClick={() => fetchStats(true)}
            disabled={loading || refreshing}
            aria-label="Refresh dashboard"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Unable to load dashboard</p>
              <p className="text-sm mt-0.5 text-red-600">{error}</p>
              <button
                onClick={() => fetchStats()}
                className="text-sm font-medium underline mt-2 hover:text-red-800 transition-colors"
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
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
            </>
          ) : stats ? (
            <>
              <StatCard
                title="Total Tasks"
                value={stats.totalTasks}
                icon={<Clock className="w-5 h-5" />}
                color="text-blue-600"
                bgColor="bg-blue-50"
                subtitle="All PCS tasks"
              />
              <StatCard
                title="Completed"
                value={stats.completedTasks}
                icon={<CheckCircle className="w-5 h-5" />}
                color="text-green-600"
                bgColor="bg-green-50"
                subtitle={`${stats.completionPercentage}% completion rate`}
              />
              <StatCard
                title="Active Tasks"
                value={stats.activeTasks}
                icon={<TrendingUp className="w-5 h-5" />}
                color="text-amber-600"
                bgColor="bg-amber-50"
                subtitle="Still in progress"
              />
              <StatCard
                title="Documents"
                value={stats.totalDocuments}
                icon={<FileText className="w-5 h-5" />}
                color="text-purple-600"
                bgColor="bg-purple-50"
                subtitle="Uploaded files"
              />
            </>
          ) : null}
        </div>

        {/* Progress Section + Recent Documents */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Progress Panel */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Overall Progress</h2>
              {!loading && stats && (
                <span className="text-sm font-semibold text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                  {stats.completionPercentage}%
                </span>
              )}
            </div>

            {loading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-gray-200 rounded-full w-full" />
                <div className="h-3 bg-gray-100 rounded w-3/4" />
                <div className="grid grid-cols-2 gap-4 mt-6">
                  <div className="h-16 bg-gray-100 rounded-lg" />
                  <div className="h-16 bg-gray-100 rounded-lg" />
                </div>
              </div>
            ) : stats ? (
              <>
                <ProgressBar
                  percentage={stats.completionPercentage}
                  className="mb-3"
                />
                <p className="text-sm text-gray-500 mb-6">
                  {getCompletionMessage(stats.completionPercentage)}
                </p>

                {/* Breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700">Completed</span>
                    </div>
                    <p className="text-2xl font-bold text-green-800">{stats.completedTasks}</p>
                    <p className="text-xs text-green-600 mt-0.5">
                      {stats.totalTasks > 0
                        ? `${Math.round((stats.completedTasks / stats.totalTasks) * 100)}% of total`
                        : 'No tasks yet'}
                    </p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-medium text-amber-700">Remaining</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-800">{stats.activeTasks}</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      {stats.totalTasks > 0
                        ? `${Math.round((stats.activeTasks / stats.totalTasks) * 100)}% of total`
                        : 'No tasks yet'}
                    </p>
                  </div>
                </div>

                <div className="mt-6 pt-5 border-t border-gray-100 flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/tasks"
                    className="flex-1 text-center px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors duration-150 shadow-sm"
                  >
                    View All Tasks
                  </Link>
                  <Link
                    href="/tasks?filter=active"
                    className="flex-1 text-center px-4 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all duration-150"
                  >
                    View Active Tasks
                  </Link>
                </div>
              </>
            ) : null}
          </div>

          {/* Recent Documents Panel */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Recent Documents</h2>
              <Link
                href="/documents"
                className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors"
              >
                View all
              </Link>
            </div>

            {loading ? (
              <div className="animate-pulse space-y-3 flex-1">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <div className="w-8 h-8 bg-gray-200 rounded" />
                    <div className="flex-1">
                      <div className="h-3 bg-gray-200 rounded w-3/4 mb-1.5" />
                      <div className="h-2.5 bg-gray-100 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : stats ? (
              <div className="flex-1">
                {stats.recentDocuments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                    <div className="bg-gray-100 rounded-full p-4 mb-3">
                      <FileText className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-500">No documents yet</p>
                    <p className="text-xs text-gray-400 mt-1">Upload your PCS paperwork to get started</p>
                    <Link
                      href="/documents"
                      className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                    >
                      Upload a document
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="space-y-0.5">
                      {stats.recentDocuments.map((doc) => (
                        <Link key={doc.id} href="/documents">
                          <RecentDocumentRow document={doc} />
                        </Link>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <Link
                        href="/documents"
                        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all duration-150"
                      >
                        <FileText className="w-4 h-4" />
                        Manage Documents
                      </Link>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>

        </div>

        {/* Quick Actions */}
        {!loading && stats && (
          <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link
                href="/tasks?action=new"
                className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-700 hover:bg-blue-100 hover:border-blue-200 transition-all duration-150 group"
              >
                <div className="bg-blue-100 group-hover:bg-blue-200 p-2 rounded-md transition-colors">
                  <Clock className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Add New Task</p>
                  <p className="text-xs text-blue-500">Create a PCS task</p>
                </div>
              </Link>

              <Link
                href="/documents?action=upload"
                className="flex items-center gap-3 px-4 py-3 bg-purple-50 border border-purple-100 rounded-lg text-purple-700 hover:bg-purple-100 hover:border-purple-200 transition-all duration-150 group"
              >
                <div className="bg-purple-100 group-hover:bg-purple-200 p-2 rounded-md transition-colors">
                  <FileText className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Upload Document</p>
                  <p className="text-xs text-purple-500">Add PCS paperwork</p>
                </div>
              </Link>

              <Link
                href="/tasks?filter=active"
                className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-100 rounded-lg text-green-700 hover:bg-green-100 hover:border-green-200 transition-all duration-150 group"
              >
                <div className="bg-green-100 group-hover:bg-green-200 p-2 rounded-md transition-colors">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Complete a Task</p>
                  <p className="text-xs text-green-500">
                    {stats.activeTasks > 0 ? `${stats.activeTasks} remaining` : 'All done!'}
                  </p>
                </div>
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default DashboardPage;