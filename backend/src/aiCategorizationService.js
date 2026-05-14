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
