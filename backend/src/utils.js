import path from 'node:path';
import fs from 'node:fs';
import { extractAdminWardId } from './wardMaster.js';

let adminWardGeoJson = null;
const adminWardGeoJsonPath = new URL('../../frontend/public/pune-admin-wards.geojson', import.meta.url);

function loadAdminWardGeoJson() {
    if (!adminWardGeoJson) {
        adminWardGeoJson = JSON.parse(fs.readFileSync(adminWardGeoJsonPath, 'utf8'));
    }

    return adminWardGeoJson;
}

function pointInRing([lng, lat], ring) {
    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        const intersects = ((yi > lat) !== (yj > lat))
            && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);

        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
}

function pointInPolygon([lng, lat], rings) {
    if (!rings?.length || !pointInRing([lng, lat], rings[0])) {
        return false;
    }

    for (let i = 1; i < rings.length; i += 1) {
        if (pointInRing([lng, lat], rings[i])) {
            return false;
        }
    }

    return true;
}

function pointInGeometry(point, geometry) {
    if (!geometry) {
        return false;
    }

    if (geometry.type === 'Polygon') {
        return pointInPolygon(point, geometry.coordinates);
    }

    if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
    }

    return false;
}

export function buildTicketId(existingIssues = []) {
    const year = new Date().getFullYear();
    const prefix = `CP-PNE-${year}-`;
    let maxSequence = 0;

    for (const issue of existingIssues) {
        const id = issue?.id;
        if (typeof id !== 'string' || !id.startsWith(prefix)) {
            continue;
        }

        const sequence = Number(id.slice(prefix.length));
        if (Number.isInteger(sequence) && sequence > maxSequence) {
            maxSequence = sequence;
        }
    }

    const nextNumber = maxSequence + 1;
    return `CP-PNE-${year}-${String(nextNumber).padStart(6, '0')}`;
}

export function findWardByCoordinates(lat, lng, wards) {
    const feature = loadAdminWardGeoJson()?.features?.find((entry) => pointInGeometry([lng, lat], entry.geometry));
    const wardId = extractAdminWardId(feature?.properties?.name);

    if (!wardId) {
        return null;
    }

    const ward = (wards || []).find((entry) => entry.id === wardId);
    if (!ward) {
        return null;
    }

    return {
        ...ward,
        boundaryName: feature?.properties?.name || null,
    };
}

export function toPublicIssue(issue, baseUrl) {
    const {
        reporterPrivateId,
        reporterNamePrivate,
        ...safeIssue
    } = issue || {};

    const imageUrl = issue.imageUrl?.startsWith('http')
        ? issue.imageUrl
        : issue.imageUrl
            ? `${baseUrl}${issue.imageUrl}`
            : null;

    const resolvedImageUrl = issue.resolvedImageUrl?.startsWith('http')
        ? issue.resolvedImageUrl
        : issue.resolvedImageUrl
            ? `${baseUrl}${issue.resolvedImageUrl}`
            : null;

    return {
        ...safeIssue,
        imageUrl,
        resolvedImageUrl,
    };
}

export function makeUploadedImagePath(filename) {
    return `/uploads/${path.basename(filename)}`;
}
