import { NextRequest, NextResponse } from 'next/server';
import { safeLog, safeError } from '../../../lib/pii-redactor';

interface InterviewRequest {
  user_input: string;
  jurisdiction: string;
  existing_answers?: Record<string, string>;
}

interface InterviewQuestion {
  id: string;
  question: string;
  category: 'facts' | 'procedure' | 'evidence' | 'timeline' | 'parties';
  required: boolean;
  hint?: string;
  placeholder?: string;
}

interface InterviewResponse {
  questions: InterviewQuestion[];
  follow_up_needed: boolean;
  confidence_score: number;
}

const SYSTEM_PROMPT = `You are a legal intake specialist AI. Your task is to generate clarifying questions that will help a Pro Se litigant prepare their case.

GUIDELINES:
1. Ask 4-7 focused questions maximum
2. Prioritize questions about:
   - Critical deadlines (when were they served?)
   - Service method (how were they notified?)
   - Key facts (what exactly happened?)
   - Evidence (what documents/witnesses exist?)
   - Damages (what harm occurred?)
3. Avoid legal jargon - use plain language
4. Be empathetic but thorough
5. If the user already provided information, don't ask redundant questions

Return your response as a JSON array of questions with this structure:
[
  {
    "id": "unique_question_id",
    "question": "Clear, specific question",
    "category": "facts|procedure|evidence|timeline|parties",
    "required": true,
    "hint": "Optional helpful context",
    "placeholder": "Example answer format"
  }
]`;

export async function POST(req: NextRequest) {
  try {
    const { user_input, jurisdiction, existing_answers = {} }: InterviewRequest = await req.json();

    if (!user_input?.trim()) {
      return NextResponse.json(
        { error: 'User input is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GLM_API_KEY;
    if (!apiKey) {
      // Fallback to static question generation
      safeLog('No GLM API key - using static question generation');
      return NextResponse.json({
        questions: generateStaticQuestions(user_input, jurisdiction),
        follow_up_needed: true,
        confidence_score: 50,
      });
    }

    // Build context from existing answers
    const existingContext = Object.entries(existing_answers)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');

    const prompt = `User's legal situation:
${user_input}

Jurisdiction: ${jurisdiction}

Already provided information:
${existingContext || 'None yet'}

Generate clarifying questions. Focus on gaps in the information provided. If the user mentioned an eviction, ask about notice type, service date, service method, reason, and any defenses. If they mentioned a contract dispute, ask about contract terms, breach details, and damages.`;

    const response = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'glm-4.7-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`GLM API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '[]';

    // Extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    const jsonString = jsonMatch ? jsonMatch[0] : '[]';

    let questions: InterviewQuestion[];
    try {
      questions = JSON.parse(jsonString);
    } catch {
      // Fallback to static questions
      questions = generateStaticQuestions(user_input, jurisdiction);
    }

    // Validate question structure
    const validatedQuestions = questions
      .filter((q): q is InterviewQuestion => !!(q.id && q.question && q.category))
      .map((q) => ({
        id: q.id,
        question: q.question,
        category: q.category,
        required: q.required ?? true,
        hint: q.hint,
        placeholder: q.placeholder,
      }));

    // Determine if follow-up is needed based on input complexity
    const followUpNeeded = user_input.split(' ').length < 50 || validatedQuestions.length > 0;
    const confidenceScore = validatedQuestions.length > 0 ? 70 : 40;

    safeLog(`Generated ${validatedQuestions.length} interview questions`);

    return NextResponse.json({
      questions: validatedQuestions,
      follow_up_needed: followUpNeeded,
      confidence_score: confidenceScore,
    } as InterviewResponse);
  } catch (error) {
    safeError('Interview question generation error:', error);

    // Fallback to static questions on error
    const { user_input, jurisdiction }: InterviewRequest = await req.json().catch(() => ({ user_input: '', jurisdiction: '' }));
    
    return NextResponse.json({
      questions: generateStaticQuestions(user_input, jurisdiction),
      follow_up_needed: true,
      confidence_score: 50,
    } as InterviewResponse);
  }
}

/**
 * Static question generation fallback
 * Used when AI is unavailable or as a base template
 */
function generateStaticQuestions(userInput: string, jurisdiction: string): InterviewQuestion[] {
  const lower = userInput.toLowerCase();
  const questions: InterviewQuestion[] = [];

  // Eviction scenarios
  if (lower.includes('evict') || lower.includes('lockout')) {
    questions.push(
      {
        id: 'notice_type',
        question: 'What type of notice did you receive?',
        category: 'procedure',
        required: true,
        hint: 'Examples: 3-day notice, 30-day notice, summons',
        placeholder: 'e.g., "3-day notice to pay rent"',
      },
      {
        id: 'service_date',
        question: 'When were you served?',
        category: 'timeline',
        required: true,
        placeholder: 'e.g., "January 15, 2025"',
      },
      {
        id: 'service_method',
        question: 'How was it delivered?',
        category: 'procedure',
        required: true,
        hint: 'This affects your response deadline',
        placeholder: 'e.g., "Handed to me", "Taped to door"',
      },
      {
        id: 'amount_owed',
        question: 'Is any rent owed? How much?',
        category: 'facts',
        required: false,
        placeholder: 'e.g., "$1,200"',
      }
    );
  }

  // Nuisance scenarios
  if (lower.includes('noise') || lower.includes('nuisance')) {
    questions.push(
      {
        id: 'nuisance_type',
        question: 'What exactly is happening?',
        category: 'facts',
        required: true,
        placeholder: 'e.g., "Loud music after midnight"',
      },
      {
        id: 'duration',
        question: 'How long has this been going on?',
        category: 'timeline',
        required: true,
        placeholder: 'e.g., "3 months"',
      },
      {
        id: 'evidence',
        question: 'Do you have any evidence?',
        category: 'evidence',
        required: false,
        hint: 'Recordings, photos, witness names',
        placeholder: 'e.g., "Audio recordings, neighbor witnessed it"',
      }
    );
  }

  // Contract scenarios
  if (lower.includes('contract') || lower.includes('agreement')) {
    questions.push(
      {
        id: 'contract_type',
        question: 'What type of agreement was it?',
        category: 'facts',
        required: true,
        placeholder: 'e.g., "Home renovation contract"',
      },
      {
        id: 'breach_details',
        question: 'What did they fail to do?',
        category: 'facts',
        required: true,
        placeholder: 'e.g., "Didn\'t finish by deadline"',
      },
      {
        id: 'damages',
        question: 'What did you lose financially?',
        category: 'facts',
        required: true,
        placeholder: 'e.g., "$5,000"',
      }
    );
  }

  // Generic fallback
  if (questions.length === 0) {
    questions.push(
      {
        id: 'main_issue',
        question: 'What is the main problem?',
        category: 'facts',
        required: true,
        placeholder: 'Describe the core issue',
      },
      {
        id: 'timeline',
        question: 'When did this start?',
        category: 'timeline',
        required: true,
        placeholder: 'e.g., "Two months ago"',
      },
      {
        id: 'goal',
        question: 'What outcome do you want?',
        category: 'facts',
        required: true,
        placeholder: 'e.g., "Get my deposit back"',
      }
    );
  }

  return questions;
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Interview question generation endpoint',
    modes: ['guided', 'batch'],
  });
}
