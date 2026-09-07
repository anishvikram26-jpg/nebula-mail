/**
 * Server-Side Gemini Chat Adapter
 *
 * Encapsulates all interactions with the Google Gemini API using @google/genai.
 * Standardizes model calls, function declaration handling, and response normalization.
 *
 * Model:
 * - Defaults to `gemini-2.5-flash` (or overridden via `GEMINI_MODEL` environment variable).
 * - Fast, cost-effective, and fully supported on the Gemini Developer API free tier.
 */

import { gemini } from '@/lib/ai/gemini';
import { GEMINI_TOOLS } from '@/lib/ai/tools';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiChatResult {
  text: string | null;
  functionCalls: GeminiFunctionCall[];
}

/**
 * Sends a message and context to Gemini with tool definitions enabled.
 * Returns normalized text and structured function calls.
 */
export async function generateAssistantResponse(params: {
  message: string;
  systemPrompt: string;
}): Promise<GeminiChatResult> {
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

  const response = await gemini.models.generateContent({
    model,
    contents: params.message.trim(),
    config: {
      systemInstruction: params.systemPrompt,
      temperature: 0.2,
      maxOutputTokens: 500,
      tools: GEMINI_TOOLS,
    },
  });

  // Extract function calls
  const functionCalls: GeminiFunctionCall[] = [];

  if (response.functionCalls && response.functionCalls.length > 0) {
    for (const fc of response.functionCalls) {
      if (fc.name) {
        functionCalls.push({
          name: fc.name,
          args: (fc.args as Record<string, unknown>) || {},
        });
      }
    }
  } else if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.functionCall && part.functionCall.name) {
        functionCalls.push({
          name: part.functionCall.name,
          args: (part.functionCall.args as Record<string, unknown>) || {},
        });
      }
    }
  }

  // Extract text response
  let text: string | null = null;
  if (response.text) {
    text = response.text.trim();
  } else if (response.candidates?.[0]?.content?.parts) {
    const textParts = response.candidates[0].content.parts
      .filter((p) => typeof p.text === 'string' && p.text.trim().length > 0)
      .map((p) => p.text?.trim());
    if (textParts.length > 0) {
      text = textParts.join('\n');
    }
  }

  return {
    text,
    functionCalls,
  };
}

/**
 * Generates a concise summary of an email or thread using Gemini.
 */
export async function generateEmailSummary(params: {
  prompt: string;
  systemPrompt: string;
}): Promise<string> {
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

  const response = await gemini.models.generateContent({
    model,
    contents: params.prompt,
    config: {
      systemInstruction: params.systemPrompt,
      temperature: 0.1,
      maxOutputTokens: 300,
    },
  });

  return response.text?.trim() || 'Could not generate summary.';
}
