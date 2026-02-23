'use client';

/**
 * Interview Mode Component
 * 
 * AI-driven follow-up question generator for Pro Se litigants.
 * Before generating the full legal strategy, the AI asks clarifying
 * questions to gather missing critical details.
 * 
 * Features:
 * - Context-aware question generation based on jurisdiction and case type
 * - Progressive disclosure (one question at a time or batch mode)
 * - Skippable questions with "I don't know" option
 * - Visual progress indicator
 */

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  HelpCircle,
  SkipForward,
  Sparkles,
  Lightbulb
} from 'lucide-react';

// Question types for different legal scenarios
interface InterviewQuestion {
  id: string;
  question: string;
  category: 'facts' | 'procedure' | 'evidence' | 'timeline' | 'parties';
  required: boolean;
  hint?: string;
  placeholder?: string;
  dependsOn?: string; // ID of question this depends on
}

interface InterviewModeProps {
  jurisdiction: string;
  userInput: string;
  onComplete: (answers: Record<string, string>) => void;
  onSkip?: () => void;
  mode?: 'guided' | 'batch'; // 'guided' = one at a time, 'batch' = all at once
}

/**
 * Generate context-aware interview questions
 * This is a simplified version - in production, this would call an API
 * that uses the AI to generate dynamic questions based on the user's input
 */
function generateInterviewQuestions(jurisdiction: string, userInput: string): InterviewQuestion[] {
  const lowerInput = userInput.toLowerCase();
  const questions: InterviewQuestion[] = [];

  // Emergency/Eviction scenarios
  if (lowerInput.includes('evict') || lowerInput.includes('lockout') || lowerInput.includes('locked out')) {
    questions.push(
      {
        id: 'eviction_notice_type',
        question: 'What type of notice did you receive?',
        category: 'procedure',
        required: true,
        hint: 'Common types: 3-day notice, 30-day notice, notice to quit, unlawful detainer summons',
        placeholder: 'e.g., "3-day notice to pay or quit"',
      },
      {
        id: 'eviction_notice_date',
        question: 'When were you served with the eviction notice?',
        category: 'timeline',
        required: true,
        placeholder: 'e.g., "January 15, 2025"',
      },
      {
        id: 'eviction_notice_method',
        question: 'How was the notice delivered to you?',
        category: 'procedure',
        required: true,
        hint: 'Service method affects your response deadline',
        placeholder: 'e.g., "Handed to me personally", "Taped to my door", "Mailed"',
      },
      {
        id: 'eviction_reason',
        question: 'What reason does the landlord give for the eviction?',
        category: 'facts',
        required: true,
        placeholder: 'e.g., "Non-payment of rent", "Lease violation", "No cause"',
      },
      {
        id: 'eviction_amount_owed',
        question: 'Is any rent owed? If so, how much?',
        category: 'facts',
        required: false,
        placeholder: 'e.g., "$1,200 for January rent"',
      },
      {
        id: 'eviction_conditions',
        question: 'Are there any habitability issues with the property?',
        category: 'evidence',
        required: false,
        hint: 'Examples: no heat, water leaks, pest infestation, mold, broken locks',
        placeholder: 'e.g., "No heat since December", "Rodent problem in kitchen"',
      }
    );
  }

  // Nuisance scenarios
  if (lowerInput.includes('nuisance') || lowerInput.includes('noise') || lowerInput.includes('neighbor')) {
    questions.push(
      {
        id: 'nuisance_type',
        question: 'What type of nuisance are you experiencing?',
        category: 'facts',
        required: true,
        placeholder: 'e.g., "Excessive noise after 10 PM", "Foul odors", "Property damage"',
      },
      {
        id: 'nuisance_duration',
        question: 'How long has this been going on?',
        category: 'timeline',
        required: true,
        placeholder: 'e.g., "3 months", "Since last summer"',
      },
      {
        id: 'nuisance_frequency',
        question: 'How often does it occur?',
        category: 'facts',
        required: true,
        placeholder: 'e.g., "Daily", "Weekends only", "2-3 times per week"',
      },
      {
        id: 'nuisance_communication',
        question: 'Have you communicated with the neighbor about this?',
        category: 'facts',
        required: true,
        placeholder: 'e.g., "Yes, spoke to them on [date]", "No, too intimidating"',
      },
      {
        id: 'nuisance_evidence',
        question: 'Do you have any evidence?',
        category: 'evidence',
        required: false,
        hint: 'Examples: recordings, photos, witness statements, police reports',
        placeholder: 'e.g., "Audio recordings", "Photos of damage", "Witness: Mrs. Smith downstairs"',
      },
      {
        id: 'nuisance_impact',
        question: 'How has this affected your health or daily life?',
        category: 'facts',
        required: true,
        hint: 'Be specific: sleep loss, stress, inability to work, medical conditions worsened',
        placeholder: 'e.g., "Can\'t sleep", "Working from home is impossible", "Anxiety attacks"',
      }
    );
  }

  // Contract/Breach scenarios
  if (lowerInput.includes('contract') || lowerInput.includes('breach') || lowerInput.includes('agreement')) {
    questions.push(
      {
        id: 'contract_type',
        question: 'What type of contract is this?',
        category: 'facts',
        required: true,
        placeholder: 'e.g., "Home renovation", "Service agreement", "Sales contract"',
      },
      {
        id: 'contract_date',
        question: 'When was the contract signed?',
        category: 'timeline',
        required: true,
        placeholder: 'e.g., "March 2024"',
      },
      {
        id: 'contract_written',
        question: 'Was the contract written or oral?',
        category: 'evidence',
        required: true,
        placeholder: 'e.g., "Written contract", "Oral agreement", "Email exchange"',
      },
      {
        id: 'contract_breach',
        question: 'What specifically did the other party fail to do?',
        category: 'facts',
        required: true,
        placeholder: 'e.g., "Didn\'t complete work by deadline", "Used wrong materials"',
      },
      {
        id: 'contract_damages',
        question: 'What are your damages (financial loss)?',
        category: 'facts',
        required: true,
        placeholder: 'e.g., "$5,000 in unpaid work", "$2,000 to fix their mistakes"',
      }
    );
  }

  // Add jurisdiction-specific deadline questions
  if (jurisdiction) {
    questions.push({
      id: 'jurisdiction_deadline',
      question: `Have you checked the filing deadline for ${jurisdiction}?`,
      category: 'procedure',
      required: false,
      hint: `Different jurisdictions have different deadlines. In ${jurisdiction}, typical deadlines range from 20-30 days.`,
      placeholder: 'e.g., "Yes, I have 20 days to respond"',
    });
  }

  // Generic fallback questions if no specific scenario matched
  if (questions.length === 0) {
    questions.push(
      {
        id: 'general_issue',
        question: 'What is the main legal issue you\'re facing?',
        category: 'facts',
        required: true,
        placeholder: 'e.g., "Landlord won\'t return security deposit"',
      },
      {
        id: 'general_date',
        question: 'When did this problem start?',
        category: 'timeline',
        required: true,
        placeholder: 'e.g., "Two months ago"',
      },
      {
        id: 'general_goal',
        question: 'What outcome are you hoping for?',
        category: 'facts',
        required: true,
        placeholder: 'e.g., "Get my deposit back", "Stop the harassment"',
      },
      {
        id: 'general_documents',
        question: 'Do you have any relevant documents?',
        category: 'evidence',
        required: false,
        placeholder: 'e.g., "Lease agreement", "Emails", "Photos"',
      }
    );
  }

  return questions;
}

export default function InterviewMode({
  jurisdiction,
  userInput,
  onComplete,
  onSkip,
  mode = 'guided',
}: InterviewModeProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [skippedQuestions, setSkippedQuestions] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const questions = useMemo(
    () => generateInterviewQuestions(jurisdiction, userInput),
    [jurisdiction, userInput]
  );

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

  const handleAnswer = useCallback((answer: string) => {
    if (!currentQuestion) return;

    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: answer,
    }));

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  }, [currentQuestion, currentQuestionIndex, questions.length]);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await onComplete(answers);
    } finally {
      setIsSubmitting(false);
    }
  }, [answers, onComplete]);

  const handleSkip = useCallback(() => {
    if (!currentQuestion) return;

    setSkippedQuestions(prev => new Set(prev).add(currentQuestion.id));

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      // Last question - submit what we have
      handleSubmit();
    }
  }, [currentQuestion, currentQuestionIndex, questions.length, handleSubmit]);

  const handleBack = useCallback(() => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  }, [currentQuestionIndex]);

  const handleSkipAll = useCallback(() => {
    if (onSkip) {
      onSkip();
    } else {
      // Skip to results with no additional info
      handleSubmit();
    }
  }, [onSkip, handleSubmit]);

  // Batch mode: show all questions at once
  if (mode === 'batch') {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <MessageSquare className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold">Clarifying Questions</h2>
          </div>
          <p className="text-gray-600">
            Please answer these questions to help us generate a more accurate legal strategy for your situation.
          </p>
        </div>

        <div className="space-y-6">
          {questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              question={question}
              value={answers[question.id] || ''}
              onChange={(value) => setAnswers(prev => ({ ...prev, [question.id]: value }))}
              index={index}
            />
          ))}
        </div>

        <div className="mt-8 flex justify-between items-center">
          <button
            onClick={handleSkipAll}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 flex items-center gap-2"
          >
            <SkipForward className="w-4 h-4" />
            Skip to Results
          </button>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Generate Strategy
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Guided mode: one question at a time
  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
          <span>{Math.round(progress)}% complete</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-blue-600"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Question Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestion.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <HelpCircle className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {currentQuestion.question}
                </h3>
                {currentQuestion.hint && (
                  <div className="flex items-start gap-2 text-sm text-gray-600 mb-4">
                    <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{currentQuestion.hint}</span>
                  </div>
                )}
              </div>
            </div>

            <textarea
              value={answers[currentQuestion.id] || ''}
              onChange={(e) => handleAnswer(e.target.value)}
              placeholder={currentQuestion.placeholder}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
              autoFocus
            />

            {/* Navigation */}
            <div className="mt-6 flex justify-between items-center">
              <div className="flex gap-2">
                <button
                  onClick={handleBack}
                  disabled={currentQuestionIndex === 0}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>

                <button
                  onClick={handleSkip}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 flex items-center gap-2"
                >
                  <SkipForward className="w-4 h-4" />
                  Skip
                </button>
              </div>

              {currentQuestionIndex === questions.length - 1 ? (
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !answers[currentQuestion.id]}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Generate Strategy
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (currentQuestionIndex < questions.length - 1) {
                      setCurrentQuestionIndex(prev => prev + 1);
                    }
                  }}
                  disabled={!answers[currentQuestion.id] && currentQuestion.required}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Question Progress Indicators */}
      <div className="mt-6 flex justify-center gap-2 flex-wrap">
        {questions.map((q, index) => {
          const isAnswered = !!answers[q.id];
          const isSkipped = skippedQuestions.has(q.id);
          const isCurrent = index === currentQuestionIndex;

          return (
            <div
              key={q.id}
              className={`w-3 h-3 rounded-full transition-colors ${
                isCurrent
                  ? 'bg-blue-600 ring-2 ring-blue-300'
                  : isAnswered
                  ? 'bg-green-500'
                  : isSkipped
                  ? 'bg-gray-400'
                  : 'bg-gray-300'
              }`}
              title={`Question ${index + 1}: ${q.question}`}
            />
          );
        })}
      </div>

      {/* Skip All Option */}
      <div className="mt-4 text-center">
        <button
          onClick={handleSkipAll}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Skip interview and generate strategy with current information
        </button>
      </div>
    </div>
  );
}

interface QuestionCardProps {
  question: InterviewQuestion;
  value: string;
  onChange: (value: string) => void;
  index: number;
}

function QuestionCard({ question, value, onChange, index }: QuestionCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white rounded-lg border border-gray-200 p-4"
    >
      <div className="flex items-start gap-3 mb-3">
        <HelpCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h4 className="font-medium text-gray-900 mb-1">{question.question}</h4>
          {question.hint && (
            <p className="text-sm text-gray-600 flex items-start gap-1">
              <Lightbulb className="w-3 h-3 mt-0.5 flex-shrink-0" />
              {question.hint}
            </p>
          )}
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
        rows={2}
      />
    </motion.div>
  );
}
