import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs/promises';
import { categories } from './data/categories.js';
import { config } from './config.js';

let anthropic = null;
if (config.anthropicApiKey) {
    anthropic = new Anthropic({
        apiKey: config.anthropicApiKey,
    });
}

let gemini = null;
if (config.geminiApiKey && ['auto', 'gemini'].includes(config.aiCategoryProvider)) {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    gemini = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
}

const CATEGORY_LIST = categories.map(c => `${c.id}: ${c.department}`).join('\n');

function keywordFallback(description = '') {
    const text = String(description).toLowerCase();
    if (text.includes('pothole')) return { suggestedCategory: 'pothole', confidence: 0.9, topCandidates: [{ id: 'pothole', confidence: 0.9 }], provider: 'fallback' };
    if (text.includes('garbage')) return { suggestedCategory: 'garbage', confidence: 0.9, topCandidates: [{ id: 'garbage', confidence: 0.9 }], provider: 'fallback' };
    return { suggestedCategory: 'other', confidence: 0.5, topCandidates: [{ id: 'other', confidence: 0.5 }], provider: 'fallback' };
}

export async function suggestCategory({ description, imagePath }) {
    const provider = config.aiCategoryProvider;

    if (provider === 'fallback') {
        return keywordFallback(description);
    }

    if (provider === 'anthropic') {
        if (anthropic) {
            return suggestWithAnthropic({ description, imagePath });
        }
        return keywordFallback(description);
    }

    if (provider === 'gemini') {
        if (gemini) {
            return suggestWithGemini({ description, imagePath });
        }
        return keywordFallback(description);
    }

    // auto: Gemini -> Anthropic -> fallback
    if (gemini) {
        return suggestWithGemini({ description, imagePath });
    }

    if (anthropic) {
        return suggestWithAnthropic({ description, imagePath });
    }

    return keywordFallback(description);
}

export async function detectImageAuthenticity({ imagePath }) {
    if (!imagePath) {
        return {
            label: 'unknown',
            confidence: 0,
            reasoning: 'No image provided.',
            provider: 'fallback',
        };
    }

    if (gemini) {
        try {
            return await detectWithGemini({ imagePath });
        } catch (error) {
            console.error('[AI] Gemini authenticity detection failed:', error);
        }
    }

    if (anthropic) {
        try {
            return await detectWithAnthropic({ imagePath });
        } catch (error) {
            console.error('[AI] Anthropic authenticity detection failed:', error);
        }
    }

    return {
        label: 'unknown',
        confidence: 0.35,
        reasoning: 'AI authenticity model is unavailable. Could not determine reliably.',
        provider: 'fallback',
    };
}

export async function generateIssueNarrative({ description, category, wardName, severity }) {
    const fallbackTitle = wardName ? `Civic issue near ${wardName}` : 'Civic issue reported';
    const fallbackTitleMr = wardName ? `${wardName} जवळील नागरी समस्या` : 'नागरी समस्या नोंदवली';
    const fallbackSummary = String(description || '').trim().slice(0, 280) || 'Citizen reported an issue requiring attention.';
    const fallbackSummaryMr = String(description || '').trim().slice(0, 280) || 'नागरिकांनी लक्ष देण्याजोगी समस्या नोंदवली आहे.';
    const provider = config.aiCategoryProvider;

    if (provider === 'fallback') {
        return { title: fallbackTitle, titleMr: fallbackTitleMr, summary: fallbackSummary, summaryMr: fallbackSummaryMr, provider: 'fallback' };
    }

    try {
        if (provider === 'gemini' && gemini) {
            return await generateNarrativeWithGemini({ description, category, wardName, severity, fallbackTitle, fallbackTitleMr, fallbackSummary, fallbackSummaryMr });
        }
        if (provider === 'anthropic' && anthropic) {
            return await generateNarrativeWithAnthropic({ description, category, wardName, severity, fallbackTitle, fallbackTitleMr, fallbackSummary, fallbackSummaryMr });
        }
        if (gemini) {
            return await generateNarrativeWithGemini({ description, category, wardName, severity, fallbackTitle, fallbackTitleMr, fallbackSummary, fallbackSummaryMr });
        }
        if (anthropic) {
            return await generateNarrativeWithAnthropic({ description, category, wardName, severity, fallbackTitle, fallbackTitleMr, fallbackSummary, fallbackSummaryMr });
        }
    } catch (error) {
        console.error('[AI] Narrative generation failed:', error);
    }

    return { title: fallbackTitle, titleMr: fallbackTitleMr, summary: fallbackSummary, summaryMr: fallbackSummaryMr, provider: 'fallback' };
}

async function generateNarrativeWithGemini({ description, category, wardName, severity, fallbackTitle, fallbackTitleMr, fallbackSummary, fallbackSummaryMr }) {
    const prompt = `Generate concise civic issue text for municipal staff.
Return strict JSON:
{
  "title": "English max 80 chars",
  "titleMr": "Marathi max 80 chars",
  "summary": "English max 220 chars",
  "summaryMr": "Marathi max 220 chars"
}

Inputs:
- category: ${category || 'other'}
- wardName: ${wardName || 'unknown'}
- severity: ${severity || 'medium'}
- description: ${description || 'Citizen reported issue'}
`;

    const result = await gemini.generateContent([prompt]);
    const response = await result.response;
    const text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(text);
    return {
        title: String(parsed?.title || fallbackTitle).trim().slice(0, 80) || fallbackTitle,
        titleMr: String(parsed?.titleMr || fallbackTitleMr).trim().slice(0, 80) || fallbackTitleMr,
        summary: String(parsed?.summary || fallbackSummary).trim().slice(0, 220) || fallbackSummary,
        summaryMr: String(parsed?.summaryMr || fallbackSummaryMr).trim().slice(0, 220) || fallbackSummaryMr,
        provider: 'gemini',
    };
}

async function generateNarrativeWithAnthropic({ description, category, wardName, severity, fallbackTitle, fallbackTitleMr, fallbackSummary, fallbackSummaryMr }) {
    const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 256,
        messages: [
            {
                role: 'user',
                content: `Generate concise civic issue text for municipal staff.
Return strict JSON:
{"title":"English max 80 chars","titleMr":"Marathi max 80 chars","summary":"English max 220 chars","summaryMr":"Marathi max 220 chars"}

Inputs:
- category: ${category || 'other'}
- wardName: ${wardName || 'unknown'}
- severity: ${severity || 'medium'}
- description: ${description || 'Citizen reported issue'}`,
            },
        ],
    });
    const parsed = JSON.parse(response.content[0].text);
    return {
        title: String(parsed?.title || fallbackTitle).trim().slice(0, 80) || fallbackTitle,
        titleMr: String(parsed?.titleMr || fallbackTitleMr).trim().slice(0, 80) || fallbackTitleMr,
        summary: String(parsed?.summary || fallbackSummary).trim().slice(0, 220) || fallbackSummary,
        summaryMr: String(parsed?.summaryMr || fallbackSummaryMr).trim().slice(0, 220) || fallbackSummaryMr,
        provider: 'anthropic',
    };
}

async function suggestWithGemini({ description, imagePath }) {
    try {
        const prompt = `You are a civic issue categorization assistant for the Pune municipal region.
Based on the citizen's description and optional photo, suggest the most appropriate category from the list below.

Available Categories:
${CATEGORY_LIST}

Description: ${description || 'No description provided.'}

Return a JSON object with:
- suggestedCategory: the ID of the best matching category.
- confidence: a number between 0 and 1.
- reasoning: a brief explanation.
- topCandidates: an array of {id, confidence} objects for the top 3 matches.

Only return the JSON object, no other text.`;

        const parts = [prompt];
        if (imagePath) {
            const imageBuffer = await fs.readFile(imagePath);
            parts.push({
                inlineData: {
                    data: imageBuffer.toString('base64'),
                    mimeType: imagePath.toLowerCase().endsWith('png') ? 'image/png' : 'image/jpeg',
                },
            });
        }

        const result = await gemini.generateContent(parts);
        const response = await result.response;
        const text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonResult = JSON.parse(text);

        return {
            suggestedCategory: jsonResult.suggestedCategory,
            confidence: jsonResult.confidence,
            reasoning: jsonResult.reasoning,
            topCandidates: jsonResult.topCandidates,
            provider: 'gemini',
        };
    } catch (error) {
        const message = String(error?.message || '');
        const details = Array.isArray(error?.errorDetails) ? error.errorDetails : [];
        const hasInvalidKeyReason = details.some((entry) => entry?.reason === 'API_KEY_INVALID');
        const isInvalidApiKey = error?.status === 400
            && (message.includes('API key not valid') || hasInvalidKeyReason);

        // Disable Gemini during this process if key is invalid to avoid repeated hard failures/log spam.
        if (isInvalidApiKey) {
            gemini = null;
            console.warn('[AI] Gemini API key invalid. Gemini disabled for this process; using fallback provider.');
        } else {
            console.error('[AI] Gemini suggestion failed:', error);
        }

        if (anthropic) return suggestWithAnthropic({ description, imagePath });
        return keywordFallback(description);
    }
}

async function suggestWithAnthropic({ description, imagePath }) {
    try {
        const messages = [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `You are a civic issue categorization assistant for the Pune municipal region.
Based on the citizen's description and optional photo, suggest the most appropriate category from the list below.

Available Categories:
${CATEGORY_LIST}

Description: ${description || 'No description provided.'}

Return a JSON object with:
- suggestedCategory: the ID of the best matching category.
- confidence: a number between 0 and 1.
- reasoning: a brief explanation.
- topCandidates: an array of {id, confidence} objects for the top 3 matches.

Only return the JSON object, no other text.`
                    }
                ]
            }
        ];

        if (imagePath) {
            const imageBuffer = await fs.readFile(imagePath);
            const base64Image = imageBuffer.toString('base64');
            const mediaType = imagePath.toLowerCase().endsWith('png') ? 'image/png' : 'image/jpeg';

            messages[0].content.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: base64Image,
                },
            });
        }

        const response = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20240620',
            max_tokens: 1024,
            messages,
        });

        const result = JSON.parse(response.content[0].text);
        return { ...result, provider: 'anthropic' };
    } catch (error) {
        console.error('[AI] Anthropic suggestion failed:', error);
        return keywordFallback(description);
    }
}

async function detectWithGemini({ imagePath }) {
    const imageBuffer = await fs.readFile(imagePath);
    const prompt = `Classify the attached image as one of:
- "real" (camera-captured / natural photo)
- "ai_generated" (synthetic/AI generated image)
- "unknown" (insufficient evidence)

Return STRICT JSON only:
{
  "label": "real | ai_generated | unknown",
  "confidence": 0.0_to_1.0,
  "reasoning": "short explanation"
}`;

    const result = await gemini.generateContent([
        prompt,
        {
            inlineData: {
                data: imageBuffer.toString('base64'),
                mimeType: imagePath.toLowerCase().endsWith('png') ? 'image/png' : 'image/jpeg',
            },
        },
    ]);
    const response = await result.response;
    const text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(text);
    return normalizeAuthenticityResult(parsed, 'gemini');
}

async function detectWithAnthropic({ imagePath }) {
    const imageBuffer = await fs.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mediaType = imagePath.toLowerCase().endsWith('png') ? 'image/png' : 'image/jpeg';
    const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 300,
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `Classify the attached image as one of "real", "ai_generated", or "unknown".
Return STRICT JSON only:
{"label":"real|ai_generated|unknown","confidence":0.0,"reasoning":"short explanation"}`,
                    },
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: mediaType,
                            data: base64Image,
                        },
                    },
                ],
            },
        ],
    });
    const parsed = JSON.parse(response.content[0].text);
    return normalizeAuthenticityResult(parsed, 'anthropic');
}

function normalizeAuthenticityResult(result, provider) {
    const rawLabel = String(result?.label || 'unknown').trim().toLowerCase();
    const label = ['real', 'ai_generated', 'unknown'].includes(rawLabel) ? rawLabel : 'unknown';
    const rawConfidence = Number(result?.confidence);
    const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0;

    return {
        label,
        confidence,
        reasoning: String(result?.reasoning || '').trim() || 'No explanation provided.',
        provider,
    };
}
