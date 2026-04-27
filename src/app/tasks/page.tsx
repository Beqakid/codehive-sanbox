'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Plus, Search, Filter, CheckCircle2, Circle, Pencil, Trash2, AlertCircle, Calendar, Flag } from 'lucide-react';
import type { Task, TaskStatus, TaskPriority } from '@/lib/types';

type FilterType = 'all' | 'active' | 'completed';

interface TaskFormData {
  title: string;
  description: string;
  dueDate: string;
  priority: TaskPriority;
}

const defaultFormData: TaskFormData = {
  title: '',
  description: '',
  dueDate: '',
  priority: 'medium',
};

const priorityConfig: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  low: { label: 'Low', color: 'text-green-600', bg: 'bg-green-100' },
  medium: { label: 'Medium', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  high: { label: 'High', color: 'text-red-600', bg: 'bg-red-100' },
};

export default function TasksPage() {
  const { getToken } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<TaskFormData>(defaultFormData);
  const [formErrors, setFormErrors] = useState<Partial<TaskFormData>>({});
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getToken();
      const res = await fetch('/api/tasks', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const data = await res.json();
      setTasks(data.tasks ?? data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const validateForm = (): boolean => {
    const errors: Partial<TaskFormData> = {};
    if (!formData.title.trim()) errors.title = 'Title is required';
    if (formData.title.trim().length > 200) errors.title = 'Title must be under 200 characters';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openCreateModal = () => {
    setEditingTask(null);
    setFormData(defaultFormData);
    setFormErrors({});
    setShowModal(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description ?? '',
      dueDate: task.dueDate ?? '',
      priority: task.priority,
    });
    setFormErrors({});
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTask(null);
    setFormData(defaultFormData);
    setFormErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setSubmitting(true);
      const token = await getToken();

      const body = {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        dueDate: formData.dueDate || undefined,
        priority: formData.priority,
      };

      let res: Response;
      if (editingTask) {
        res = await fetch(`/api/tasks/${editingTask.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch('/api/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) throw new Error(editingTask ? 'Failed to update task' : 'Failed to create task');

      const saved = await res.json();
      const updatedTask: Task = saved.task ?? saved;

      if (editingTask) {
        setTasks(prev => prev.map(t => (t.id === updatedTask.id ? updatedTask : t)));
      } else {
        setTasks(prev => [updatedTask, ...prev]);
      }

      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (task: Task) => {
    try {
      setTogglingId(task.id);
      const token = await getToken();
      const newStatus: TaskStatus = task.status === 'active' ? 'completed' : 'active';

      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Failed to update task status');

      const saved = await res.json();
      const updatedTask: Task = saved.task ?? saved;
      setTasks(prev => prev.map(t => (t.id === updatedTask.id ? updatedTask : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task? This action cannot be undone.')) return;

    try {
      setDeletingId(taskId);
      const token = await getToken();
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to delete task');
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredTasks = tasks.filter(task => {
    const matchesFilter =
      filter === 'all' || task.status === filter;
    const matchesSearch =
      !searchQuery ||
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.description ?? '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const activeTasks = tasks.filter(t => t.status === 'active').length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const completionPct = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

  const isOverdue = (task: Task): boolean => {
    if (!task.dueDate || task.status === 'completed') return false;
    return new Date(task.dueDate) < new Date(new Date().toDateString());
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">PCS Tasks</h1>
            <p className="text-sm text-gray-500 mt-1">
              {activeTasks} active · {completedTasks} completed
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <Plus size={16} />
            Add Task
          </button>
        </div>

        {/* Progress Bar */}
        {tasks.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Overall Progress</span>
              <span className="text-sm font-semibold text-indigo-600">{completionPct}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${completionPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {completedTasks} of {tasks.length} tasks completed
            </p>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-5 text-red-700 text-sm">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 font-medium">
              Dismiss
            </button>
          </div>
        )}

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-1 bg-white border border-gray-300 rounded-lg p-1">
            <Filter size={14} className="text-gray-400 ml-1 mr-0.5" />
            {(['all', 'active', 'completed'] as FilterType[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-md text-sm font-medium capitalize transition-colors ${
                  filter === f
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Task List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-gray-200 mt-0.5 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            {tasks.length === 0 ? (
              <>
                <CheckCircle2 size={40} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No tasks yet</p>
                <p className="text-gray-400 text-sm mt-1">Add your first PCS task to get started</p>
                <button
                  onClick={openCreateModal}
                  className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Add Task
                </button>
              </>
            ) : (
              <>
                <Search size={40} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No matching tasks</p>
                <p className="text-gray-400 text-sm mt-1">Try adjusting your search or filter</p>
              </>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {filteredTasks.map(task => {
              const overdue = isOverdue(task);
              const priority = priorityConfig[task.priority];
              const isCompleted = task.status === 'completed';

              return (
                <li
                  key={task.id}
                  className={`bg-white rounded-xl border transition-all ${
                    isCompleted ? 'border-gray-200 opacity-75' : overdue ? 'border-red-200' : 'border-gray-200'
                  } hover:shadow-sm`}
                >
                  <div className="p-4 flex items-start gap-3">
                    {/* Toggle Button */}
                    <button
                      onClick={() => handleToggleStatus(task)}
                      disabled={togglingId === task.id}
                      className="mt-0.5 shrink-0 text-gray-400 hover:text-indigo-600 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-full disabled:opacity-50"
                      aria-label={isCompleted ? 'Mark as active' : 'Mark as completed'}
                    >
                      {togglingId === task.id ? (
                        <div className="w-5 h-5 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
                      ) : isCompleted ? (
                        <CheckCircle2 size={20} className="text-indigo-500" />
                      ) : (
                        <Circle size={20} />
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-sm font-medium ${
                            isCompleted ? 'line-through text-gray-400' : 'text-gray-900'
                          }`}
                        >
                          {task.title}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priority.bg} ${priority.color}`}>
                          <Flag size={10} className="inline mr-1" />
                          {priority.label}
                        </span>
                      </div>

                      {task.description && (
                        <p className={`text-xs mt-1 ${isCompleted ? 'text-gray-400' : 'text-gray-500'} line-clamp-2`}>
                          {task.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        {task.dueDate && (
                          <span
                            className={`flex items-center gap-1 text-xs ${
                              overdue ? 'text-red-600 font-medium' : 'text-gray-400'
                            }`}
                          >
                            <Calendar size={11} />
                            {overdue && !isCompleted ? 'Overdue · ' : ''}
                            {formatDate(task.dueDate)}
                          </span>
                        )}
                        {overdue && !isCompleted && (
                          <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                            <AlertCircle size={11} />
                            Past due
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        onClick={() => openEditModal(task)}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        aria-label="Edit task"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(task.id)}
                        disabled={deletingId === task.id}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                        aria-label="Delete task"
                      >
                        {deletingId === task.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-600 animate-spin rounded-full" />
                        ) : (
                          <Trash2 size={15} />
                        )}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeModal}
          />

          {/* Dialog */}
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">
              {editingTask ? 'Edit Task' : 'New Task'}
            </h2>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* Title */}
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  id="title"
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Schedule housing appointment"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                    formErrors.title ? 'border-red-400' : 'border-gray-300'
                  }`}
                />
                {formErrors.title && (
                  <p className="text-xs text-red-500 mt-1">{formErrors.title}</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  rows={3}
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional details about this task..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Due Date + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-1">
                    Due Date
                  </label>
                  <input
                    id="dueDate"
                    type="date"
                    value={formData.dueDate}
                    onChange={e => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">
                    Priority
                  </label>
                  <select
                    id="priority"
                    value={formData.priority}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, priority: e.target.value as TaskPriority }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white animate-spin rounded-full" />
                      {editingTask ? 'Saving...' : 'Creating...'}
                    </>
                  ) : editingTask ? (
                    'Save Changes'
                  ) : (
                    'Create Task'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}