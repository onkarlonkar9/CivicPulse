import { describe, expect, it } from 'vitest';
import { buildCityIssueStats, buildWardAnalytics } from '../../../backend/src/wardAnalytics.js';

const sampleIssues = [
    {
        id: 'CP-1',
        wardId: 1,
        category: 'pothole',
        status: 'resolved',
        verification: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z',
        timeline: [
            { status: 'new', timestamp: '2026-04-01T00:00:00.000Z' },
            { status: 'resolved', timestamp: '2026-04-03T00:00:00.000Z' },
        ],
    },
    {
        id: 'CP-2',
        wardId: 1,
        category: 'garbage',
        status: 'new',
        verification: null,
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
        timeline: [
            { status: 'new', timestamp: '2026-04-04T00:00:00.000Z' },
        ],
    },
];

const wardMetadata = [
    {
        id: 1,
        nameEn: 'Aundh',
        nameMr: 'Aundh',
        officeName: 'Aundh Ward Office',
        officeAddress: 'Aundh, Pune',
        officePhone: '020-00000000',
        electoralWards: [6, 7, 8, 9, 10],
        officeLat: 18.56,
        officeLng: 73.81,
    },
];

describe('ward analytics', () => {
    it('computes ward metrics from real issues', () => {
        const ward = buildWardAnalytics(sampleIssues, wardMetadata).find((entry) => entry.id === 1);

        expect(ward.totalIssues).toBe(2);
        expect(ward.resolvedIssues).toBe(1);
        expect(ward.openIssues).toBe(1);
        expect(ward.verificationRate).toBe(100);
        expect(ward.avgResolutionDays).toBe(2);
        expect(ward.score).toBeTypeOf('number');
    });

    it('computes city summary from resolved issues only', () => {
        const stats = buildCityIssueStats(sampleIssues);

        expect(stats.total).toBe(2);
        expect(stats.resolved).toBe(1);
        expect(stats.activeWards).toBe(1);
        expect(stats.avgResolutionDays).toBe(2);
    });
});
