import { useState } from 'react';
import { FileText, Image, File, Trash2, Eye, Download, Calendar, HardDrive } from 'lucide-react';
import { Document } from '@/lib/types';

interface DocumentCardProps {
  document: Document;
  onDelete: (id: string) => Promise<void>;
  onView: (id: string) => Promise<void>;
}

function getFileIcon(fileType: string) {
  if (fileType === 'application/pdf') {
    return <FileText className="w-8 h-8 text-red-500" />;
  }
  if (fileType.startsWith('image/')) {
    return <Image className="w-8 h-8 text-blue-500" />;
  }
  return <File className="w-8 h-8 text-gray-500" />;
}

function getFileTypeBadge(fileType: string): { label: string; className: string } {
  if (fileType === 'application/pdf') {
    return { label: 'PDF', className: 'bg-red-100 text-red-700' };
  }
  if (fileType.startsWith('image/')) {
    const subtype = fileType.split('/')[1].toUpperCase();
    return { label: subtype, className: 'bg-blue-100 text-blue-700' };
  }
  const subtype = fileType.split('/')[1]?.toUpperCase() ?? 'FILE';
  return { label: subtype, className: 'bg-gray-100 text-gray-700' };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function DocumentCard({ document, onDelete, onView }: DocumentCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const badge = getFileTypeBadge(document.fileType);

  async function handleView() {
    setIsViewing(true);
    try {
      await onView(document.id);
    } finally {
      setIsViewing(false);
    }
  }

  async function handleDeleteConfirm() {
    setIsDeleting(true);
    try {
      await onDelete(document.id);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 p-4 flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 p-2 bg-gray-50 rounded-lg">
          {getFileIcon(document.fileType)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              className="text-sm font-semibold text-gray-900 truncate max-w-full"
              title={document.filename}
            >
              {document.filename}
            </h3>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}
            >
              {badge.label}
            </span>
          </div>

          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(document.uploadedAt)}
            </span>
            <span className="flex items-center gap-1">
              <HardDrive className="w-3.5 h-3.5" />
              {formatFileSize(document.fileSize)}
            </span>
          </div>
        </div>
      </div>

      {/* Action buttons / delete confirm */}
      {showDeleteConfirm ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-gray-700 font-medium">
            Delete <span className="font-semibold">{document.filename}</span>? This cannot be
            undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="flex-1 py-1.5 px-3 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
              className="flex-1 py-1.5 px-3 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={handleView}
            disabled={isViewing}
            className="flex items-center gap-1.5 flex-1 justify-center py-1.5 px-3 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label={`View ${document.filename}`}
          >
            {isViewing ? (
              <>
                <Download className="w-4 h-4 animate-bounce" />
                Opening…
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" />
                View
              </>
            )}
          </button>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isViewing}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label={`Delete ${document.filename}`}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}