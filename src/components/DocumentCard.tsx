import { useState } from "react";
import { Document } from "@/lib/types";
import {
  FileText,
  Image,
  File,
  Trash2,
  Eye,
  Download,
  MoreVertical,
  Loader2,
} from "lucide-react";

interface DocumentCardProps {
  document: Document;
  onDelete: (id: string) => Promise<void>;
  onView: (id: string) => Promise<void>;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getFileIcon(fileType: string) {
  if (fileType === "application/pdf") {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-red-100">
        <FileText className="w-5 h-5 text-red-600" />
      </div>
    );
  }

  if (fileType.startsWith("image/")) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100">
        <Image className="w-5 h-5 text-blue-600" />
      </div>
    );
  }

  if (
    fileType.includes("word") ||
    fileType.includes("document") ||
    fileType.includes("msword")
  ) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-100">
        <FileText className="w-5 h-5 text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100">
      <File className="w-5 h-5 text-gray-600" />
    </div>
  );
}

function getFileTypeBadge(fileType: string): { label: string; className: string } {
  if (fileType === "application/pdf") {
    return { label: "PDF", className: "bg-red-100 text-red-700" };
  }
  if (fileType.startsWith("image/")) {
    const sub = fileType.split("/")[1].toUpperCase();
    return { label: sub, className: "bg-blue-100 text-blue-700" };
  }
  if (fileType.includes("word") || fileType.includes("msword")) {
    return { label: "DOCX", className: "bg-indigo-100 text-indigo-700" };
  }
  const sub = fileType.split("/")[1]?.toUpperCase() ?? "FILE";
  return { label: sub, className: "bg-gray-100 text-gray-700" };
}

export default function DocumentCard({
  document,
  onDelete,
  onView,
}: DocumentCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isViewing, setIsViewing] = useState(false);

  const badge = getFileTypeBadge(document.fileType);

  async function handleDelete() {
    if (!window.confirm(`Are you sure you want to delete "${document.filename}"?`)) {
      return;
    }
    setIsDeleting(true);
    setMenuOpen(false);
    try {
      await onDelete(document.id);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleView() {
    setIsViewing(true);
    setMenuOpen(false);
    try {
      await onView(document.id);
    } finally {
      setIsViewing(false);
    }
  }

  return (
    <div className="relative flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* File Type Icon */}
      <div className="flex-shrink-0">{getFileIcon(document.fileType)}</div>

      {/* File Details */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p
            className="truncate text-sm font-semibold text-gray-900 max-w-[200px] sm:max-w-xs"
            title={document.filename}
          >
            {document.filename}
          </p>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <span>{formatFileSize(document.fileSize)}</span>
          <span className="hidden sm:inline">·</span>
          <span>Uploaded {formatDate(document.uploadedAt)}</span>
        </div>
      </div>

      {/* Action Buttons — Desktop */}
      <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleView}
          disabled={isViewing || isDeleting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          title="View document"
        >
          {isViewing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
          View
        </button>

        <button
          onClick={handleDelete}
          disabled={isDeleting || isViewing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 shadow-sm transition hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Delete document"
        >
          {isDeleting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          Delete
        </button>
      </div>

      {/* Action Menu — Mobile */}
      <div className="relative sm:hidden flex-shrink-0">
        <button
          onClick={() => setMenuOpen((prev) => !prev)}
          disabled={isDeleting || isViewing}
          className="flex items-center justify-center rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Document actions"
        >
          {isDeleting || isViewing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <MoreVertical className="w-4 h-4" />
          )}
        </button>

        {menuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
            />
            {/* Dropdown */}
            <div className="absolute right-0 top-8 z-20 w-36 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
              <button
                onClick={handleView}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Eye className="w-4 h-4" />
                View
              </button>
              <button
                onClick={handleDelete}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}