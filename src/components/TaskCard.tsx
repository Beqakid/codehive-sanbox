'use client';

import { useState } from 'react';
import { Task, TaskPriority, TaskStatus } from '@/lib/types';
import { CheckCircle2, Circle, Pencil, Trash2, X, Check, Calendar, AlertCircle } from 'lucide-react';
import { format, isAfter, parseISO } from 'date-fns';

interface TaskCardProps {
  task: Task;
  onUpdate: (id: string, updates: Partial<Omit<Task, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; classes: string; dot: string }> = {
  low: {
    label: 'Low',
    classes: 'bg-green-100 text-green-700 border-green-200',
    dot: 'bg-green-500',
  },
  medium: {
    label: 'Medium',
    classes: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    dot: 'bg-yellow-500',
  },
  high: {
    label: 'High',
    classes: 'bg-red-100 text-red-700 border-red-200',
    dot: 'bg-red-500',
  },
};

export default function TaskCard({ task, onUpdate, onDelete }: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description ?? '');
  const [editDueDate, setEditDueDate] = useState(task.dueDate ?? '');
  const [editPriority, setEditPriority] = useState<TaskPriority>(task.priority);

  const isCompleted = task.status === 'completed';
  const priorityConfig = PRIORITY_CONFIG[task.priority];

  const isOverdue =
    task.dueDate &&
    !isCompleted &&
    isAfter(new Date(), parseISO(task.dueDate));

  const handleToggleComplete = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      const newStatus: TaskStatus = isCompleted ? 'active' : 'completed';
      await onUpdate(task.id, { status: newStatus });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEditSave = async () => {
    if (!editTitle.trim()) return;
    setIsUpdating(true);
    try {
      await onUpdate(task.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        dueDate: editDueDate || undefined,
        priority: editPriority,
      });
      setIsEditing(false);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEditCancel = () => {
    setEditTitle(task.title);
    setEditDescription(task.description ?? '');
    setEditDueDate(task.dueDate ?? '');
    setEditPriority(task.priority);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(task.id);
    } catch {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className={`group relative rounded-xl border bg-white shadow-sm transition-all duration-200 hover:shadow-md ${
        isCompleted ? 'border-gray-200 opacity-70' : 'border-gray-200'
      } ${isOverdue ? 'border-l-4 border-l-red-500' : ''}`}
    >
      {isEditing ? (
        /* ── Edit Mode ─────────────────────────────────────── */
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition"
              placeholder="Task title"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition resize-none"
              placeholder="Optional description"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition"
              />
            </div>

            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
              <select
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition bg-white"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={handleEditCancel}
              disabled={isUpdating}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
            >
              <X size={14} />
              Cancel
            </button>
            <button
              onClick={handleEditSave}
              disabled={isUpdating || !editTitle.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition disabled:opacity-50"
            >
              {isUpdating ? (
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Save
            </button>
          </div>
        </div>
      ) : (
        /* ── View Mode ─────────────────────────────────────── */
        <div className="p-5">
          <div className="flex items-start gap-3">
            {/* Complete toggle */}
            <button
              onClick={handleToggleComplete}
              disabled={isUpdating}
              className={`mt-0.5 flex-shrink-0 transition-colors duration-150 disabled:opacity-50 ${
                isCompleted
                  ? 'text-green-500 hover:text-green-600'
                  : 'text-gray-300 hover:text-blue-500'
              }`}
              title={isCompleted ? 'Mark as active' : 'Mark as complete'}
            >
              {isUpdating ? (
                <span className="block h-5 w-5 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
              ) : isCompleted ? (
                <CheckCircle2 size={22} />
              ) : (
                <Circle size={22} />
              )}
            </button>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3
                  className={`text-sm font-semibold leading-snug ${
                    isCompleted ? 'line-through text-gray-400' : 'text-gray-900'
                  }`}
                >
                  {task.title}
                </h3>

                {/* Action buttons (visible on hover or focus-within) */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={() => setIsEditing(true)}
                    disabled={isDeleting}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition disabled:opacity-50"
                    title="Edit task"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50"
                    title="Delete task"
                  >
                    {isDeleting ? (
                      <span className="block h-3.5 w-3.5 rounded-full border-2 border-red-400 border-t-transparent animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                </div>
              </div>

              {/* Description */}
              {task.description && (
                <p className={`mt-1 text-xs leading-relaxed ${isCompleted ? 'text-gray-400' : 'text-gray-500'}`}>
                  {task.description}
                </p>
              )}

              {/* Meta row */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {/* Priority badge */}
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${priorityConfig.classes}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${priorityConfig.dot}`} />
                  {priorityConfig.label}
                </span>

                {/* Due date */}
                {task.dueDate && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      isOverdue
                        ? 'bg-red-50 text-red-600'
                        : isCompleted
                        ? 'bg-gray-100 text-gray-400'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {isOverdue ? <AlertCircle size={11} /> : <Calendar size={11} />}
                    {format(parseISO(task.dueDate), 'MMM d, yyyy')}
                    {isOverdue && ' · Overdue'}
                  </span>
                )}

                {/* Completed badge */}
                {isCompleted && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-600">
                    <CheckCircle2 size={11} />
                    Completed
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}