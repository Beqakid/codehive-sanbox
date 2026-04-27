'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Document } from '@/lib/types';
import DocumentCard from '@/components/DocumentCard';
import { Upload, FileText, AlertCircle, Loader2, CloudUpload } from 'lucide-react';

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface UploadState {
  status: UploadStatus;
  progress: number;
  errorMessage?: string;
  filename?: string;
}

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function DocumentsPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle', progress: 0 });
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const fetchDocuments = useCallback(async () => {
    try {
      setIsLoadingDocuments(true);
      setFetchError(null);
      const response = await fetch('/api/documents');
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch documents');
      }
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoadingDocuments(false);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      fetchDocuments();
    }
  }, [isLoaded, isSignedIn, fetchDocuments]);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return `File type "${file.type}" is not supported. Please upload a PDF or image file.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File size exceeds 10MB limit. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`;
    }
    return null;
  };

  const uploadFile = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setUploadState({ status: 'error', progress: 0, errorMessage: validationError, filename: file.name });
      return;
    }

    setUploadState({ status: 'uploading', progress: 0, filename: file.name });

    try {
      // Step 1: Get presigned upload URL
      const urlResponse = await fetch('/api/documents/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          fileType: file.type,
          fileSize: file.size,
        }),
      });

      if (!urlResponse.ok) {
        const data = await urlResponse.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate upload URL');
      }

      const { uploadUrl, storageKey } = await urlResponse.json();

      setUploadState((prev) => ({ ...prev, progress: 20 }));

      // Step 2: Upload directly to R2
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }

      setUploadState((prev) => ({ ...prev, progress: 70 }));

      // Step 3: Save metadata
      const metaResponse = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          storageKey,
          fileType: file.type,
          fileSize: file.size,
        }),
      });

      if (!metaResponse.ok) {
        const data = await metaResponse.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save document metadata');
      }

      const { document: newDoc } = await metaResponse.json();

      setUploadState({ status: 'success', progress: 100, filename: file.name });
      setDocuments((prev) => [newDoc, ...prev]);

      // Reset after 3 seconds
      setTimeout(() => {
        setUploadState({ status: 'idle', progress: 0 });
      }, 3000);
    } catch (err) {
      setUploadState({
        status: 'error',
        progress: 0,
        errorMessage: err instanceof Error ? err.message : 'Upload failed',
        filename: file.name,
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
    // Reset input so same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounterRef.current = 0;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      uploadFile(file);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    try {
      const response = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete document');
      }
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    } catch (err) {
      console.error('Delete error:', err);
      // Surface error to user via a non-blocking notification if needed
    }
  };

  const handleViewDocument = async (id: string) => {
    try {
      const response = await fetch(`/api/documents/${id}/url`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate view URL');
      }
      const { url } = await response.json();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('View error:', err);
    }
  };

  const isUploading = uploadState.status === 'uploading';

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload and manage your PCS-related documents. Supported formats: PDF, JPEG, PNG, GIF, WebP (max 10MB).
        </p>
      </div>

      {/* Upload Area */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
          ${isDragOver
            ? 'border-blue-500 bg-blue-50 scale-[1.01]'
            : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/50'
          }
          ${isUploading ? 'cursor-not-allowed opacity-75' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          onChange={handleFileSelect}
          disabled={isUploading}
          className="hidden"
        />

        {uploadState.status === 'idle' && (
          <div className="space-y-3">
            <div className="flex justify-center">
              <div className={`p-3 rounded-full transition-colors ${isDragOver ? 'bg-blue-100' : 'bg-gray-100'}`}>
                <CloudUpload className={`h-8 w-8 ${isDragOver ? 'text-blue-600' : 'text-gray-400'}`} />
              </div>
            </div>
            <div>
              <p className="text-base font-medium text-gray-700">
                {isDragOver ? 'Drop your file here' : 'Drag & drop a file here'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                or{' '}
                <span className="text-blue-600 font-medium hover:text-blue-700">browse to upload</span>
              </p>
            </div>
          </div>
        )}

        {uploadState.status === 'uploading' && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="p-3 bg-blue-100 rounded-full">
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
              </div>
            </div>
            <div>
              <p className="text-base font-medium text-gray-700">
                Uploading <span className="text-blue-600">{uploadState.filename}</span>
              </p>
              <div className="mt-3 w-full bg-gray-200 rounded-full h-2 max-w-xs mx-auto">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
              <p className="text-sm text-gray-500 mt-1">{uploadState.progress}%</p>
            </div>
          </div>
        )}

        {uploadState.status === 'success' && (
          <div className="space-y-3">
            <div className="flex justify-center">
              <div className="p-3 bg-green-100 rounded-full">
                <Upload className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <div>
              <p className="text-base font-medium text-green-700">Upload successful!</p>
              <p className="text-sm text-gray-500 mt-1">{uploadState.filename} has been saved.</p>
            </div>
          </div>
        )}

        {uploadState.status === 'error' && (
          <div className="space-y-3">
            <div className="flex justify-center">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
            </div>
            <div>
              <p className="text-base font-medium text-red-700">Upload failed</p>
              <p className="text-sm text-red-500 mt-1">{uploadState.errorMessage}</p>
              <p className="text-sm text-gray-500 mt-2">Click to try again</p>
            </div>
          </div>
        )}
      </div>

      {/* Documents List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Your Documents
            {!isLoadingDocuments && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({documents.length} {documents.length === 1 ? 'file' : 'files'})
              </span>
            )}
          </h2>
          {!isLoadingDocuments && documents.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                fetchDocuments();
              }}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Refresh
            </button>
          )}
        </div>

        {isLoadingDocuments ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
              <p className="text-sm text-gray-500">Loading your documents...</p>
            </div>
          </div>
        ) : fetchError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-red-700">{fetchError}</p>
            <button
              onClick={fetchDocuments}
              className="mt-3 text-sm text-red-600 hover:text-red-700 underline font-medium"
            >
              Try again
            </button>
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-12 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-gray-100 rounded-full">
                <FileText className="h-10 w-10 text-gray-400" />
              </div>
            </div>
            <p className="text-base font-medium text-gray-700">No documents yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Upload your first PCS document using the area above.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                onDelete={handleDeleteDocument}
                onView={handleViewDocument}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}