/**
 * AUDIO TRANSCRIPTION ROUTES
 * ==========================
 * 
 * Routes for audio transcription using OpenAI Whisper API
 * with optional AI enhancement for different modes
 */

import { Elysia, t } from "elysia";

interface TranscriptionResponse {
  text: string;
}

interface OpenAITranscriptionResponse {
  text?: string;
}

interface OpenAICompletionResponse {
  choices: Array<{
    message: {
      content?: string;
    };
  }>;
}

export default new Elysia()

  // Audio transcription endpoint
  .post("/", async ({ request, set }) => {

    try {
      // Parse multipart form data from request
      const formData = await request.formData();
      
      // Get uploaded audio file
      const audioFile = formData.get('audio') as File;
      const mode = (formData.get('mode') as string) || 'default';
      
      if (!audioFile) {
        set.status = 400;
        return { error: 'No audio file provided' };
      }

      // Check for OpenAI API key
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        set.status = 500;
        return { error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in server environment.' };
      }

      try {
        // Prepare FormData for OpenAI Whisper API
        const whisperFormData = new FormData();
        whisperFormData.append('file', audioFile, audioFile.name);
        whisperFormData.append('model', 'whisper-1');
        whisperFormData.append('response_format', 'json');
        whisperFormData.append('language', 'en');

        // Make request to OpenAI Whisper API
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
          body: whisperFormData
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as any;
          throw new Error(errorData.error?.message || `Whisper API error: ${response.status}`);
        }

        const data = await response.json() as OpenAITranscriptionResponse;
        let transcribedText = data.text || '';

        // If no transcribed text, return empty
        if (!transcribedText) {
          return { text: '' };
        }

        // If default mode, return transcribed text without enhancement
        if (mode === 'default') {
          return { text: transcribedText };
        }

        // Handle different enhancement modes using OpenAI
        try {
          let prompt: string | null = null;
          let systemMessage: string = '';
          let temperature = 0.7;
          const maxTokens = 800;

          switch (mode) {
            case 'prompt':
              systemMessage = 'You are an expert prompt engineer who creates clear, detailed, and effective prompts.';
              prompt = `You are an expert prompt engineer. Transform the following rough instruction into a clear, detailed, and context-aware AI prompt.

Your enhanced prompt should:
1. Be specific and unambiguous
2. Include relevant context and constraints
3. Specify the desired output format
4. Use clear, actionable language
5. Include examples where helpful
6. Consider edge cases and potential ambiguities

Transform this rough instruction into a well-crafted prompt:
"${transcribedText}"

Enhanced prompt:`;
              break;

            case 'vibe':
            case 'instructions':
            case 'architect':
              systemMessage = 'You are a helpful assistant that formats ideas into clear, actionable instructions for AI agents.';
              temperature = 0.5; // Lower temperature for more controlled output
              prompt = `Transform the following idea into clear, well-structured instructions that an AI agent can easily understand and execute.

IMPORTANT RULES:
- Format as clear, step-by-step instructions
- Add reasonable implementation details based on common patterns
- Only include details directly related to what was asked
- Do NOT add features or functionality not mentioned
- Keep the original intent and scope intact
- Use clear, actionable language an agent can follow

Transform this idea into agent-friendly instructions:
"${transcribedText}"

Agent instructions:`;
              break;

            default:
              // No enhancement needed
              break;
          }

          // Only make GPT call if we have a prompt
          if (prompt) {
            const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                  { role: 'system', content: systemMessage },
                  { role: 'user', content: prompt }
                ],
                temperature: temperature,
                max_tokens: maxTokens
              })
            });

            if (gptResponse.ok) {
              const gptData = await gptResponse.json() as OpenAICompletionResponse;
              transcribedText = gptData.choices[0]?.message?.content || transcribedText;
            } else {
              console.error('GPT API error:', await gptResponse.text());
              // Fall back to original transcription if GPT fails
            }
          }

        } catch (gptError) {
          console.error('GPT processing error:', gptError);
          // Fall back to original transcription if GPT fails
        }

        return { text: transcribedText };

      } catch (error) {
        console.error('❌ Transcription error:', error);
        set.status = 500;
        return { error: error instanceof Error ? error.message : 'Transcription failed' };
      }

    } catch (error) {
      console.error('❌ Error in transcription endpoint:', error);
      set.status = 500;
      return { error: 'Internal server error' };
    }
  }, {
    type: 'multipart/form-data',
    detail: {
      tags: ["Transcription"],
      summary: "Transcribe Audio to Text",
      description: "Transcribe audio files to text using OpenAI Whisper API with optional AI enhancement modes (prompt, instructions, architect)"
    }
  });