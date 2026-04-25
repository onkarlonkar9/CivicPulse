import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findAdminWardFromGeoJson } from '@/data/adminWards.js';

// eslint-disable-next-line no-undef
const geoJsonPath = path.resolve(process.cwd(), 'public', 'pune-admin-wards.geojson');
const wardGeoJson = JSON.parse(fs.readFileSync(geoJsonPath, 'utf8'));

describe('admin ward lookup', () => {
    it('matches a known Aundh ward office coordinate to Aundh', () => {
        const ward = findAdminWardFromGeoJson(18.561222, 73.814835, wardGeoJson);

        expect(ward?.id).toBe(1);
        expect(ward?.nameEn).toBe('Aundh');
    });

    it('returns null for a point outside the Pune admin ward boundaries', () => {
        const ward = findAdminWardFromGeoJson(18.700000, 73.500000, wardGeoJson);

        expect(ward).toBeNull();
    });
});
