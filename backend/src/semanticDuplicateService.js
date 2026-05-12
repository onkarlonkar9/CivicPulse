import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'node:fs/promises';
import { config } from './config.js';
import { getCollection } from './mongo.js';

let gemini = null;
if (config.geminiApiKey) {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    gemini = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
}

export async function checkSemanticDuplicates(newIssue, nearbyIssues) {
    if (!gemini || nearbyIssues.length === 0) {
        return []; // Fallback to standard detection
    }

    try {
        const issuesToCompare = nearbyIssues.map(issue => ({
            id: issue.id,
            description: issue.description,
            category: issue.category,
            location: issue.locationDescription,
        }));

        const prompt = `You are a civic issue management assistant for Pune.
A citizen is reporting a new issue. We need to check if it's a DUPLICATE of an existing nearby issue.

New Issue:
Category: ${newIssue.category}
Description: ${newIssue.description}
Location: ${newIssue.locationDescription}

Existing Nearby Issues:
${JSON.stringify(issuesToCompare, null, 2)}

Task:
Compare the new issue with the existing ones. Determine if any of them are reporting the EXACT SAME physical problem (e.g., the same pothole, the same pile of garbage).

Return a JSON object with:
- duplicates: an array of objects for each match { id, matchScore (0-1), reasoning }.
- isDuplicate: boolean (true if any matchScore > 0.8).

Only return the JSON object, no other text.`;

        const parts = [prompt];
        
        // If the new issue has photos, they would be passed in a real scenario
        // For now, we compare text descriptions

        const result = await gemini.generateContent(parts);
        const response = await result.response;
        const text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonResult = JSON.parse(text);

        if (jsonResult.isDuplicate) {
            return nearbyIssues.filter(issue => 
                jsonResult.duplicates.some(d => d.id === issue.id && d.matchScore > 0.8)
            );
        }

        return [];
    } catch (error) {
        console.error('[AI] Semantic duplicate check failed:', error);
        return []; // Fallback to conservative approach
    }
}
