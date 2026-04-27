'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Document } from '@/lib/types';
import DocumentCard from './DocumentCard';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'saving' | 'done' | 'error';
  errorMessage?: string;
}

export default function DocumentsPage() {
  const { getToken } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const fetchDocuments = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/documents', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch documents');
      const data = await res.json();
      setDocuments(data.documents ?? []);
    } catch (err) {
      setError('Failed to load documents. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const generateUploadId = () =>
    `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return `"${file.name}" is not a supported file type. Please upload PDF or image files.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `"${file.name}" exceeds the 10MB size limit.`;
    }
    return null;
  };

  const uploadFile = async (uploadingFile: UploadingFile) => {
    const { file, id } = uploadingFile;

    const updateStatus = (
      update: Partial<Omit<UploadingFile, 'id' | 'file'>>
    ) => {
      setUploadingFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...update } : f))
      );
    };

    try {
      updateStatus({ status: 'uploading', progress: 10 });

      const token = await getToken();

      // Get presigned upload URL
      const urlRes = await fetch('/api/documents/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: file.name,
          fileType: file.type,
          fileSize: file.size,
        }),
      });

      if (!urlRes.ok) {
        const errData = await urlRes.json().catch(() => ({}));
        throw new Error(errData.error ?? 'Failed to get upload URL');
      }

      const { uploadUrl, storageKey } = await urlRes.json();
      updateStatus({ progress: 30 });

      // Upload directly to R2
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadRes.ok) throw new Error('Failed to upload file to storage');
      updateStatus({ status: 'saving', progress: 75 });

      // Save metadata
      const metaRes = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: file.name,
          storageKey,
          fileType: file.type,
          fileSize: file.size,
        }),
      });

      if (!metaRes.ok) {
        const errData = await metaRes.json().catch(() => ({}));
        throw new Error(errData.error ?? 'Failed to save document metadata');
      }

      const { document: newDoc } = await metaRes.json();
      updateStatus({ status: 'done', progress: 100 });

      setDocuments((prev) => [newDoc, ...prev]);

      // Remove from uploading list after a short delay
      setTimeout(() => {
        setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
      }, 1500);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      updateStatus({ status: 'error', errorMessage: message });
    }
  };

  const processFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles: UploadingFile[] = [];
    const errors: string[] = [];

    for (const file of fileArray) {
      const validationError = validateFile(file);
      if (validationError) {
        errors.push(validationError);
      } else {
        validFiles.push({
          id: generateUploadId(),
          file,
          progress: 0,
          status: 'pending',
        });
      }
    }

    if (errors.length > 0) {
      setError(errors.join('\n'));
    } else {
      setError(null);
    }

    if (validFiles.length > 0) {
      setUploadingFiles((prev) => [...prev, ...validFiles]);
      validFiles.forEach((uf) => uploadFile(uf));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      // Reset input so the same file can be re-uploaded
      e.target.value = '';
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete document');
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      setError('Failed to delete document. Please try again.');
    }
  };

  const handleView = async (docId: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/documents/${docId}/url`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to get document URL');
      const { url } = await res.json();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError('Failed to open document. Please try again.');
    }
  };

  const dismissUploadError = (id: string) => {
    setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const hasActiveUploads = uploadingFiles.some(
    (f) => f.status === 'uploading' || f.status === 'saving'
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Documents</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload and manage your PCS documents securely. Supported formats: PDF,
          JPEG, PNG, GIF, WebP (max 10MB each).
        </p>
      </div>

      {/* Global error banner */}
      {error && (
        <div className="mb-6 rounded-md bg-red-50 border border-red-200 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              {error.split('\n').map((line, i) => (
                <p key={i} className="text-sm text-red-700">
                  {line}
                </p>
              ))}
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 transition-colors"
              aria-label="Dismiss error"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Upload Zone */}
      <div
        className={`mb-8 rounded-xl border-2 border-dashed transition-colors duration-200 ${
          isDragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <svg
            className={`mb-4 h-12 w-12 transition-colors ${
              isDragging ? 'text-blue-400' : 'text-gray-400'
            }`}
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
            aria-hidden="true"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p
            className={`mb-2 text-base font-medium ${
              isDragging ? 'text-blue-600' : 'text-gray-700'
            }`}
          >
            {isDragging ? 'Drop your files here' : 'Drag & drop files here'}
          </p>
          <p className="mb-4 text-sm text-gray-500">or</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={hasActiveUploads}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Choose Files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_TYPES.join(',')}
            onChange={handleFileInputChange}
            className="hidden"
            aria-label="File upload input"
          />
        </div>
      </div>

      {/* Upload Progress List */}
      {uploadingFiles.length > 0 && (
        <div className="mb-8 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Uploads
          </h2>
          {uploadingFiles.map((uf) => (
            <div
              key={uf.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileTypeIcon mimeType={uf.file.type} className="h-8 w-8 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {uf.file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(uf.file.size)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {uf.status === 'done' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Done
                    </span>
                  )}
                  {(uf.status === 'uploading' || uf.status === 'saving') && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      <svg
                        className="h-3 w-3 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      {uf.status === 'saving' ? 'Saving...' : 'Uploading...'}
                    </span>
                  )}
                  {uf.status === 'error' && (
                    <button
                      onClick={() => dismissUploadError(uf.id)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      aria-label="Dismiss"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {(uf.status === 'uploading' ||
                uf.status === 'saving' ||
                uf.status === 'done') && (
                <div className="mt-3">
                  <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        uf.status === 'done' ? 'bg-green-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${uf.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error message */}
              {uf.status === 'error' && uf.errorMessage && (
                <p className="mt-2 text-xs text-red-600">{uf.errorMessage}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Document List */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Your Documents
            {documents.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({documents.length})
              </span>
            )}
          </h2>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-lg border border-gray-200 bg-gray-100 animate-pulse"
              />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
            <svg
              className="mb-4 h-12 w-12 text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-base font-medium text-gray-500">
              No documents uploaded yet
            </p>
            <p className="mt-1 text-sm text-gray-400">
              Upload your first PCS document using the area above.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                onDelete={handleDelete}
                onView={handleView}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileTypeIconProps {
  mimeType: string;
  className?: string;
}

function FileTypeIcon({ mimeType, className = 'h-8 w-8' }: FileTypeIconProps) {
  const isPdf = mimeType === 'application/pdf';
  const isImage = mimeType.startsWith('image/');

  if (isPdf) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-red-100 ${className}`}
      >
        <span className="text-xs font-bold text-red-600">PDF</span>
      </div>
    );
  }

  if (isImage) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-purple-100 ${className}`}
      >
        <svg
          className="h-4 w-4 text-purple-600"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.22-2.219a.75.75 0 00-1.06 0l-1.91 1.909.47.47a.75.75 0 11-1.06 1.06L6.53 8.091a.75.75 0 00-1.06 0l-2.97 2.97zM12 7a1 1 0 11-2 0 1 1 0 012 0z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-lg bg-gray-100 ${className}`}
    >
      <svg
        className="h-4 w-4 text-gray-500"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path d="M3 3.5A1.5 1.5 0 014.5 2h6.879a1.5 1.5 0 011.06.44l4.122 4.12A1.5 1.5 0 0117 7.622V16.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 16.5v-13z" />
      </svg>
    </div>
  );
}