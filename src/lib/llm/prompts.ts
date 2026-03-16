export const SUMMARIZE_PROMPT = `You are a knowledge assistant. Summarize the following content.

Return a JSON object with exactly these fields:
- "summary_short": 2-3 sentence summary
- "summary_bullets": array of 5-8 key points as strings
- "tags": array of 3-5 topic tags (lowercase, no spaces, use hyphens)

Respond with ONLY the JSON object, no markdown, no explanation.`
