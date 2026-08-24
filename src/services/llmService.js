const fetch = require('node-fetch');

const MODEL = 'claude-sonnet-5'; // swap to 'claude-haiku-4-5-20251001' for a cheaper/faster option

async function callClaude(prompt, maxTokens = 500) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return (data.content || []).map((b) => b.text || '').join('\n').trim();
}

/**
 * Pre-visit summary: urgency level, chief complaint, suggested questions.
 * Always returns a usable object, even if the LLM call fails — a broken
 * or missing API key must never block a booking.
 */
async function generatePreVisitSummary(symptoms) {
  const prompt = `Analyse these symptoms and return ONLY a JSON object (no markdown, no prose) with keys:
"urgencyLevel" (one of "Low", "Medium", "High"),
"chiefComplaint" (a short one-line summary),
"suggestedQuestions" (an array of exactly three short questions the doctor could ask the patient).

Symptoms: ${symptoms}`;

  try {
    const raw = await callClaude(prompt, 400);
    const jsonText = extractJson(raw);
    const parsed = JSON.parse(jsonText);
    return {
      urgencyLevel: parsed.urgencyLevel || 'Medium',
      chiefComplaint: parsed.chiefComplaint || symptoms.slice(0, 140),
      suggestedQuestions: Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions.slice(0, 3) : [],
      llmGenerated: true
    };
  } catch (err) {
    console.error('[llmService] pre-visit summary failed, using fallback:', err.message);
    return fallbackPreVisitSummary(symptoms);
  }
}

function fallbackPreVisitSummary(symptoms) {
  // Very simple keyword-based heuristic so the doctor still sees *something*
  // useful if the LLM is unavailable. Not a substitute for triage.
  const urgent = /(chest pain|difficulty breathing|severe|can't breathe|unconscious|bleeding heavily)/i;
  return {
    urgencyLevel: urgent.test(symptoms) ? 'High' : 'Medium',
    chiefComplaint: symptoms.slice(0, 140),
    suggestedQuestions: [
      'When did the symptoms start?',
      'Have you experienced this before?',
      'Are you currently taking any medication?'
    ],
    llmGenerated: false
  };
}

/**
 * Post-visit summary: patient-friendly explanation of the doctor's notes,
 * including medication schedule and follow-up steps.
 */
async function generatePostVisitSummary(notes, prescription) {
  const prompt = `Convert these clinical notes into a patient-friendly summary with a medication schedule and follow-up steps. Use plain, reassuring language a non-medical person can understand. Keep it under 200 words.

Clinical notes: ${notes}
Prescription: ${prescription || 'None provided'}`;

  try {
    const text = await callClaude(prompt, 500);
    return { text, llmGenerated: true };
  } catch (err) {
    console.error('[llmService] post-visit summary failed, using fallback:', err.message);
    return {
      text: `Here is a summary of your visit:\n\n${notes}\n\nPrescription: ${prescription || 'None'}\n\n(Automatic plain-language summary is temporarily unavailable — this is your doctor's original note. Please contact the clinic if anything is unclear.)`,
      llmGenerated: false
    };
  }
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in LLM response');
  return text.slice(start, end + 1);
}

module.exports = { generatePreVisitSummary, generatePostVisitSummary };
