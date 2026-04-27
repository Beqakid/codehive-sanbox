'use client';

import { useState } from 'react';
import { Task, TaskPriority, TaskStatus } from '@/lib/types';
import { format, parseISO, isPast } from 'date-fns';
import {
  CheckCircleIcon,
  CircleIcon,
  Pencil1Icon,
  TrashIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@radix-ui/react-icons';

interface TaskCardProps {
  task: Task;
  onUpdate: (id: string, updates: Partial<Task>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const priorityConfig: Record<
  TaskPriority,
  { label: string; className: string; dotClass: string }
> = {
  low: {
    label: 'Low',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
    dotClass: 'bg-slate-400',
  },
  medium: {
    label: 'Medium',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    dotClass: 'bg-amber-400',
  },
  high: {
    label: 'High',
    className: 'bg-red-50 text-red-700 border-red-200',
    dotClass: 'bg-red-400',
  },
};

export default function TaskCard({ task, onUpdate, onDelete }: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description ?? '');
  const [editDueDate, setEditDueDate] = useState(task.dueDate ?? '');
  const [editPriority, setEditPriority] = useState<TaskPriority>(task.priority);

  const isCompleted = task.status === 'completed';
  const isOverdue =
    !isCompleted && task.dueDate ? isPast(parseISO(task.dueDate)) : false;

  const priority = priorityConfig[task.priority];

  const handleToggleComplete = async () => {
    setIsLoading(true);
    try {
      const newStatus: TaskStatus = isCompleted ? 'active' : 'completed';
      await onUpdate(task.id, { status: newStatus });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return;
    setIsLoading(true);
    try {
      await onUpdate(task.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        dueDate: editDueDate || undefined,
        priority: editPriority,
      });
      setIsEditing(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditTitle(task.title);
    setEditDescription(task.description ?? '');
    setEditDueDate(task.dueDate ?? '');
    setEditPriority(task.priority);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3000);
      return;
    }
    setIsLoading(true);
    try {
      await onDelete(task.id);
    } finally {
      setIsLoading(false);
    }
  };

  const formattedDueDate = task.dueDate
    ? format(parseISO(task.dueDate), 'MMM d, yyyy')
    : null;

  if (isEditing) {
    return (
      <div className="bg-white border border-blue-200 rounded-xl shadow-sm p-4 space-y-3 transition-all">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Task Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Task title"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Description
          </label>
          <textarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            placeholder="Optional description"
            rows={2}
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Priority
            </label>
            <select
              value={editPriority}
              onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={handleCancelEdit}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveEdit}
            disabled={isLoading || !editTitle.trim()}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group bg-white border rounded-xl shadow-sm transition-all duration-200 hover:shadow-md ${
        isCompleted
          ? 'border-slate-100 opacity-70'
          : isOverdue
          ? 'border-red-200'
          : 'border-slate-200'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Complete toggle */}
          <button
            onClick={handleToggleComplete}
            disabled={isLoading}
            className={`flex-shrink-0 mt-0.5 rounded-full transition-colors disabled:opacity-50 ${
              isCompleted
                ? 'text-green-500 hover:text-green-600'
                : 'text-slate-300 hover:text-blue-500'
            }`}
            aria-label={isCompleted ? 'Mark as active' : 'Mark as complete'}
          >
            {isCompleted ? (
              <CheckCircleIcon className="w-5 h-5" />
            ) : (
              <CircleIcon className="w-5 h-5" />
            )}
          </button>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3
                className={`text-sm font-semibold leading-snug ${
                  isCompleted ? 'line-through text-slate-400' : 'text-slate-800'
                }`}
              >
                {task.title}
              </h3>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setIsEditing(true)}
                  disabled={isLoading}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                  aria-label="Edit task"
                >
                  <Pencil1Icon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isLoading}
                  className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                    deleteConfirm
                      ? 'text-red-600 bg-red-50 hover:bg-red-100'
                      : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                  }`}
                  aria-label={deleteConfirm ? 'Confirm delete' : 'Delete task'}
                  title={deleteConfirm ? 'Click again to confirm' : 'Delete task'}
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {/* Priority badge */}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${priority.className}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${priority.dotClass}`} />
                {priority.label}
              </span>

              {/* Due date */}
              {formattedDueDate && (
                <span
                  className={`inline-flex items-center gap-1 text-xs ${
                    isOverdue
                      ? 'text-red-600 font-medium'
                      : isCompleted
                      ? 'text-slate-400'
                      : 'text-slate-500'
                  }`}
                >
                  <CalendarIcon className="w-3 h-3" />
                  {isOverdue && !isCompleted ? 'Overdue · ' : ''}
                  {formattedDueDate}
                </span>
              )}

              {/* Status badge */}
              {isCompleted && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                  Completed
                </span>
              )}
            </div>

            {/* Description expand/collapse */}
            {task.description && (
              <div className="mt-2">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUpIcon className="w-3 h-3" />
                      Hide details
                    </>
                  ) : (
                    <>
                      <ChevronDownIcon className="w-3 h-3" />
                      Show details
                    </>
                  )}
                </button>
                {isExpanded && (
                  <p className="mt-1.5 text-xs text-slate-600 leading-relaxed bg-slate-50 rounded-lg px-3 py-2">
                    {task.description}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirm banner */}
      {deleteConfirm && (
        <div className="border-t border-red-100 bg-red-50 px-4 py-2 rounded-b-xl">
          <p className="text-xs text-red-600 font-medium">
            Click the trash icon again to confirm deletion.
          </p>
        </div>
      )}
    </div>
  );
}