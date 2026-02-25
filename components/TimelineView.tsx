'use client';

import { useState, useMemo } from 'react';
import { Calendar, Clock, AlertCircle, CheckCircle, Flag, ChevronRight } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface RoadmapItemWithDates {
  step: number;
  title: string;
  description: string;
  estimated_time?: string;
  required_documents?: string[];
  start_date?: string; // ISO date string
  deadline_date?: string; // ISO date string
}

interface TimelineViewProps {
  roadmap: RoadmapItemWithDates[];
  jurisdiction: string;
  completedSteps: number[]; // Array of completed step numbers
  onStepComplete: (stepNumber: number) => void;
}

interface TimelineDay {
  date: Date;
  items: RoadmapItemWithDates[];
  isToday: boolean;
  isPast: boolean;
}

export default function TimelineView({
  roadmap,
  jurisdiction,
  completedSteps,
  onStepComplete,
}: TimelineViewProps) {
  const [viewMode, setViewMode] = useState<'timeline' | 'list'>('timeline');

  // Parse dates and create timeline data
  const timelineData = useMemo(() => {
    if (!roadmap || roadmap.length === 0) return null;

    // Find the earliest and latest dates
    const dates = roadmap
      .flatMap(item => [
        item.start_date ? new Date(item.start_date) : null,
        item.deadline_date ? new Date(item.deadline_date) : null,
      ])
      .filter((date): date is Date => date !== null && !isNaN(date.getTime()));

    if (dates.length === 0) return null;

    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    const today = new Date();

    // Add padding to the timeline
    minDate.setDate(minDate.getDate() - 3);
    maxDate.setDate(maxDate.getDate() + 7);

    // Create array of all dates in range
    const allDates: TimelineDay[] = [];
    const currentDate = new Date(minDate);

    while (currentDate <= maxDate) {
      const itemsOnDate = roadmap.filter(
        item =>
          (item.start_date && new Date(item.start_date).toDateString() === currentDate.toDateString()) ||
          (item.deadline_date && new Date(item.deadline_date).toDateString() === currentDate.toDateString())
      );

      allDates.push({
        date: new Date(currentDate),
        items: itemsOnDate,
        isToday: currentDate.toDateString() === today.toDateString(),
        isPast: currentDate < today,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
      minDate,
      maxDate,
      days: allDates,
      today,
    };
  }, [roadmap]);

  // Calculate progress percentage
  const progressPercentage = useMemo(() => {
    if (!roadmap || roadmap.length === 0) return 0;
    const completed = roadmap.filter(item => completedSteps.includes(item.step)).length;
    return Math.round((completed / roadmap.length) * 100);
  }, [roadmap, completedSteps]);

  // Get deadline status for an item
  const getDeadlineStatus = (item: RoadmapItemWithDates) => {
    if (!item.deadline_date) return null;

    const deadline = new Date(item.deadline_date);
    const today = new Date();
    const daysUntilDeadline = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilDeadline < 0) {
      return { status: 'overdue' as const, days: Math.abs(daysUntilDeadline), label: `${Math.abs(daysUntilDeadline)}d overdue` };
    } else if (daysUntilDeadline === 0) {
      return { status: 'due-today' as const, days: 0, label: 'Due today' };
    } else if (daysUntilDeadline <= 3) {
      return { status: 'urgent' as const, days: daysUntilDeadline, label: `${daysUntilDeadline}d left` };
    } else {
      return { status: 'on-track' as const, days: daysUntilDeadline, label: `${daysUntilDeadline}d` };
    }
  };

  if (!roadmap || roadmap.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
        <p className="text-slate-500">No timeline data available for this case.</p>
        <p className="text-sm text-slate-400 mt-2">The AI will generate deadline dates when analyzing your case.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" role="region" aria-label="Procedural timeline">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Procedural Timeline</h2>
          <p className="text-sm text-slate-500 mt-1">{jurisdiction} • {roadmap.length} milestones</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Progress indicator - accessible */}
          <div 
            className="bg-slate-100 rounded-full px-4 py-2 text-sm font-semibold"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="text-indigo-600">{progressPercentage}%</span> Complete
          </div>
          {/* View toggle - accessible */}
          <div 
            className="flex border border-slate-200 rounded-lg overflow-hidden"
            role="group"
            aria-label="Timeline view mode"
          >
            <button
              onClick={() => setViewMode('timeline')}
              className={cn(
                'px-3 py-2 text-sm font-medium transition-colors',
                viewMode === 'timeline' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              )}
              aria-pressed={viewMode === 'timeline'}
            >
              Timeline
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'px-3 py-2 text-sm font-medium transition-colors',
                viewMode === 'list' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              )}
              aria-pressed={viewMode === 'list'}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'timeline' && timelineData && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 overflow-x-auto">
          {/* Timeline header with dates */}
          <div className="flex items-center gap-2 min-w-max">
            {timelineData.days.map((day, index) => (
              <div
                key={index}
                className={cn(
                  'flex flex-col items-center justify-center w-12 h-20 rounded-lg border-2',
                  day.isToday ? 'border-indigo-600 bg-indigo-50' : day.isPast ? 'border-slate-200 bg-slate-50' : 'border-slate-200'
                )}
              >
                <span className="text-xs font-medium text-slate-500">
                  {day.date.toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <span className={cn(
                  'text-lg font-bold',
                  day.isToday ? 'text-indigo-600' : day.isPast ? 'text-slate-400' : 'text-slate-700'
                )}>
                  {day.date.getDate()}
                </span>
              </div>
            ))}
          </div>

          {/* Timeline items */}
          <div className="mt-4 relative min-w-max">
            {/* Progress line */}
            <div className="absolute top-4 left-0 right-0 h-1 bg-slate-200 rounded-full" />
            <div
              className="absolute top-4 left-0 h-1 bg-indigo-600 rounded-full transition-all duration-500"
              style={{ width: `${progressPercentage}%` }}
            />

            {/* Items positioned on timeline */}
            <div className="relative h-32">
              {roadmap.map((item, index) => {
                const deadlineStatus = getDeadlineStatus(item);
                const isCompleted = completedSteps.includes(item.step);
                const positionPercent = (index / (roadmap.length - 1)) * 100;

                return (
                  <div
                    key={item.step}
                    className="absolute top-0 transform -translate-x-1/2"
                    style={{ left: `${positionPercent}%` }}
                  >
                    <button
                      onClick={() => onStepComplete(item.step)}
                      className={cn(
                        'w-10 h-10 rounded-full border-4 flex items-center justify-center transition-all shadow-lg hover:scale-110',
                        isCompleted
                          ? 'bg-green-500 border-green-200 text-white'
                          : deadlineStatus?.status === 'overdue'
                          ? 'bg-red-500 border-red-200 text-white animate-pulse'
                          : deadlineStatus?.status === 'urgent'
                          ? 'bg-amber-500 border-amber-200 text-white'
                          : 'bg-indigo-600 border-indigo-200 text-white'
                      )}
                      title={item.title}
                    >
                      {isCompleted ? <CheckCircle size={16} /> : <Flag size={16} />}
                    </button>

                    {/* Item details popup */}
                    <div className="absolute top-12 left-1/2 transform -translate-x-1/2 w-48 bg-white border border-slate-200 rounded-lg shadow-xl p-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity hover:opacity-100">
                      <h4 className="font-semibold text-sm text-slate-800 mb-1">{item.title}</h4>
                      <p className="text-xs text-slate-600 mb-2 line-clamp-2">{item.description}</p>
                      {deadlineStatus && (
                        <div className={cn(
                          'text-xs font-semibold px-2 py-1 rounded inline-block',
                          deadlineStatus.status === 'overdue' ? 'bg-red-100 text-red-700' :
                          deadlineStatus.status === 'urgent' ? 'bg-amber-100 text-amber-700' :
                          'bg-green-100 text-green-700'
                        )}>
                          {deadlineStatus.label}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {viewMode === 'list' && (
        <div className="space-y-3">
          {roadmap.map((item) => {
            const deadlineStatus = getDeadlineStatus(item);
            const isCompleted = completedSteps.includes(item.step);

            return (
              <div
                key={item.step}
                className={cn(
                  'bg-white border rounded-xl p-4 transition-all hover:shadow-md',
                  isCompleted ? 'border-green-200 bg-green-50/30' : 'border-slate-200'
                )}
              >
                <div className="flex items-start gap-4">
                  {/* Step indicator */}
                  <button
                    onClick={() => onStepComplete(item.step)}
                    className={cn(
                      'flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all',
                      isCompleted
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-slate-300 text-slate-300 hover:border-indigo-500 hover:text-indigo-500'
                    )}
                  >
                    {isCompleted ? <CheckCircle size={20} /> : <span className="text-sm font-bold">{item.step}</span>}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <h3 className={cn(
                          'text-lg font-bold transition-colors',
                          isCompleted ? 'text-green-600 line-through opacity-70' : 'text-slate-800'
                        )}>
                          {item.title}
                        </h3>
                        <p className={cn(
                          'mt-1 text-sm leading-relaxed',
                          isCompleted ? 'text-slate-400' : 'text-slate-600'
                        )}>
                          {item.description}
                        </p>
                      </div>

                      {/* Deadline badge */}
                      {deadlineStatus && (
                        <div className={cn(
                          'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1',
                          deadlineStatus.status === 'overdue' ? 'bg-red-100 text-red-700' :
                          deadlineStatus.status === 'due-today' ? 'bg-red-100 text-red-700 animate-pulse' :
                          deadlineStatus.status === 'urgent' ? 'bg-amber-100 text-amber-700' :
                          'bg-green-100 text-green-700'
                        )}>
                          <Clock size={12} />
                          {deadlineStatus.label}
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {item.start_date && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Calendar size={12} />
                          <span>Start: {new Date(item.start_date).toLocaleDateString()}</span>
                        </div>
                      )}
                      {item.deadline_date && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Flag size={12} />
                          <span>Deadline: {new Date(item.deadline_date).toLocaleDateString()}</span>
                        </div>
                      )}
                      {item.estimated_time && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Clock size={12} />
                          <span>{item.estimated_time}</span>
                        </div>
                      )}
                    </div>

                    {/* Required documents */}
                    {item.required_documents && item.required_documents.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Required:</span>
                        {item.required_documents.map((doc, docIdx) => (
                          <span
                            key={docIdx}
                            className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md border border-indigo-100 flex items-center gap-1"
                          >
                            <Flag size={10} />
                            {doc}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Navigation arrow */}
                    <div className="mt-3 flex items-center gap-1 text-indigo-600 text-sm font-medium">
                      <span>Next step</span>
                      <ChevronRight size={14} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
          <AlertCircle size={16} />
          Timeline Legend
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500" />
            <span className="text-xs text-slate-600">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-indigo-600" />
            <span className="text-xs text-slate-600">On Track</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-amber-500" />
            <span className="text-xs text-slate-600">Urgent (≤3 days)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-slate-600">Overdue</span>
          </div>
        </div>
      </div>
    </div>
  );
}
