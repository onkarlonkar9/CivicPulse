import { z } from 'zod';
import { getCollection } from './mongo.js';

const WARD_MASTER_DOC_ID = 'pmc-ward-master';

const wardSchema = z.object({
    id: z.coerce.number().int().positive(),
    nameEn: z.string().trim().min(2).max(120),
    nameMr: z.string().trim().min(2).max(120),
    officeName: z.string().trim().min(2).max(180),
    officeAddress: z.string().trim().min(2).max(300),
    officePhone: z.string().trim().min(2).max(120),
    electoralWards: z.array(z.coerce.number().int().positive()).default([]),
    officeLat: z.coerce.number().min(-90).max(90),
    officeLng: z.coerce.number().min(-180).max(180),
});

const wardDataSourceSchema = z.object({
    source: z.string().trim().min(2).max(180),
    url: z.string().trim().url(),
    lastVerifiedOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().trim().max(400).default(''),
});

const wardMasterSchema = z.object({
    wardDataSource: wardDataSourceSchema,
    wards: z.array(wardSchema).min(1).max(100),
});

const defaultWardMaster = {
    wardDataSource: {
        source: 'PMC Property Tax Collection Center ward office list',
        url: 'https://propertytax.punecorporation.org/CollectionCenter.html',
        lastVerifiedOn: '2026-04-16',
        notes: 'Ward office names/addresses/phones aligned to the official list above.',
    },
    wards: [
        { id: 1, nameEn: 'Aundh', nameMr: 'Aundh', officeName: 'Aundh Ward Office', officeAddress: 'Indo Brehman Chowk, Aundh Bodygate, Pune 411007', officePhone: '020-25897982, 020-25897983', electoralWards: [6, 7, 8, 9, 10], officeLat: 18.561222, officeLng: 73.814835 },
        { id: 2, nameEn: 'Ghole Road', nameMr: 'Ghole Road', officeName: 'Shivajinagar-Ghole Road Ward Office', officeAddress: 'Opposite PMC Press, Ghole Road, Pune 411004', officePhone: '020-25501500, 020-25511956', electoralWards: [11, 12, 13, 24, 25, 36], officeLat: 18.523935, officeLng: 73.844421 },
        { id: 3, nameEn: 'Kothrud', nameMr: 'Kothrud', officeName: 'Kothrud-Bawdhan Ward Office', officeAddress: 'Golden Hind Building, Behind Paranjape School, Bhelkenagar Chowk, D.P. Road, Kothrud, Pune 411038', officePhone: '020-25501600, 020-25380781, 020-25432620', electoralWards: [26, 27, 28, 29, 34], officeLat: 18.501205, officeLng: 73.80954 },
        { id: 4, nameEn: 'Warje-Karvenagar', nameMr: 'Warje-Karvenagar', officeName: 'Warje-Karvenagar Ward Office', officeAddress: 'Swpnashilp Commercial Building, Pune 411038', officePhone: '020-25432192, 020-25432193', electoralWards: [30, 31, 32, 33, 35], officeLat: 18.498283, officeLng: 73.82359300000002 },
        { id: 5, nameEn: 'Dhole-Patil Road', nameMr: 'Dhole-Patil Road', officeName: 'Dhole-Patil Road Ward Office', officeAddress: 'Dhole Patil Market Building, Pune 411001', officePhone: '020-26141470, 020-26141472', electoralWards: [20, 21, 22, 23, 40], officeLat: 18.536552, officeLng: 73.875603 },
        { id: 6, nameEn: 'Yerawada', nameMr: 'Yerawada', officeName: 'Yerawada Ward Office', officeAddress: 'Nagar Road, Opp. Hotel Sargam, Yerawada, Pune 411006', officePhone: '020-25509100', electoralWards: [1, 5, 14, 15, 16], officeLat: 18.545198, officeLng: 73.887741 },
        { id: 7, nameEn: 'Nagar Road (Wadgaon Sheri)', nameMr: 'Nagar Road (Wadgaon Sheri)', officeName: 'Nagar Road (Wadgaon Sheri) Ward Office', officeAddress: 'Nagar Road, Ramwadi, Pune 411014', officePhone: '020-25509000, 020-26630103', electoralWards: [2, 3, 4, 17, 18, 19], officeLat: 18.557896, officeLng: 73.908691 },
        { id: 8, nameEn: 'Kasaba (Vishrambaug Wada)', nameMr: 'Kasaba (Vishrambaug Wada)', officeName: 'Kasaba (Vishrambaug Wada) Ward Office', officeAddress: 'PMC Commercial Building, 802, Sadashiv Peth, Near Shanipar, Pune 411030', officePhone: '020-24431461', electoralWards: [37, 38, 49, 50, 51, 58], officeLat: 18.525145, officeLng: 73.860107 },
        { id: 9, nameEn: 'Tilak Road', nameMr: 'Tilak Road', officeName: 'Tilak Road Ward Office', officeAddress: 'Shivajirao Dhere Udyog Bhavan, Tilak Road, Pune 411030', officePhone: '020-25508000, 020-24431467, 020-24431468', electoralWards: [52, 53, 54, 55, 56], officeLat: 18.503445, officeLng: 73.855705 },
        { id: 10, nameEn: 'Sahakar Nagar', nameMr: 'Sahakar Nagar', officeName: 'Sahakar Nagar Ward Office', officeAddress: 'Utsav Building Corner, Near Market Yard Corner, Pune 411037', officePhone: '020-24229768', electoralWards: [57, 66, 67, 68], officeLat: 18.489082, officeLng: 73.858032 },
        { id: 11, nameEn: 'Bibwe Wadi', nameMr: 'Bibwe Wadi', officeName: 'Bibwe Wadi Ward Office', officeAddress: 'Utsav Building Corner, 2nd Floor, Near Market Yard Corner, Pune 411037', officePhone: '020-25508700, 020-24229768', electoralWards: [64, 70, 71, 72], officeLat: 18.489082, officeLng: 73.858032 },
        { id: 12, nameEn: 'Bhavani Peth', nameMr: 'Bhavani Peth', officeName: 'Bhavani Peth Ward Office', officeAddress: 'General Arun Kumar Vaidya Stadium Building, Bhawani Peth, Pune 411042', officePhone: '020-26437040, 020-26437041', electoralWards: [39, 47, 48, 59, 60, 65], officeLat: 18.508816, officeLng: 73.870041 },
        { id: 13, nameEn: 'Hadapsar', nameMr: 'Hadapsar', officeName: 'Hadapsar Ward Office', officeAddress: 'Near Pandit J. Nehru Market, Hadapsar, Pune 411028', officePhone: '020-26821092, 020-26821093', electoralWards: [42, 43, 44, 45], officeLat: 18.500481, officeLng: 73.934006 },
        { id: 14, nameEn: 'Dhanakawadi Nagar', nameMr: 'Dhanakawadi Nagar', officeName: 'Dhanakawadi Nagar Ward Office', officeAddress: 'Survey No. 2, Behind Sawant Corner Building, Katraj, Pune 411046', officePhone: '020-24317154, 020-24319147', electoralWards: [69, 73, 74, 75, 76], officeLat: 18.4478, officeLng: 73.85788 },
        { id: 15, nameEn: 'Kondhwa (Wanawadi)', nameMr: 'Kondhwa (Wanawadi)', officeName: 'Kondhwa (Wanawadi) Ward Office', officeAddress: 'Vitthalrao Shivarkar Road, KPCT Mall, Fatima Nagar, Behind Vishal Mega Mart, Wanowrie, Pune 411040', officePhone: 'N/A (not listed on source page)', electoralWards: [41, 46, 61, 62, 63], officeLat: 18.504034, officeLng: 73.900429 },
    ],
};

function ensureUniqueWardIds(wards) {
    const seen = new Set();
    for (const ward of wards) {
        if (seen.has(ward.id)) {
            throw new Error(`Duplicate ward id in ward master: ${ward.id}`);
        }
        seen.add(ward.id);
    }
}

function normalizeWardMaster(payload) {
    const parsed = wardMasterSchema.parse(payload);
    const wards = [...parsed.wards].sort((a, b) => a.id - b.id);
    ensureUniqueWardIds(wards);
    return {
        wardDataSource: parsed.wardDataSource,
        wards,
    };
}

export function extractAdminWardId(value) {
    const match = /Admin Ward\s*(\d+)/i.exec(value || '');
    return match ? Number(match[1]) : null;
}

function parseNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function collectRingCoordinates(geometry) {
    if (!geometry) {
        return [];
    }

    if (geometry.type === 'Polygon') {
        return geometry.coordinates?.flat(1) || [];
    }

    if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates?.flat(2) || [];
    }

    return [];
}

function centroidFromGeometry(geometry) {
    const points = collectRingCoordinates(geometry);
    if (!points.length) {
        return { lat: null, lng: null };
    }

    const totals = points.reduce((acc, [lng, lat]) => ({
        lng: acc.lng + (Number(lng) || 0),
        lat: acc.lat + (Number(lat) || 0),
    }), { lat: 0, lng: 0 });

    return {
        lat: totals.lat / points.length,
        lng: totals.lng / points.length,
    };
}

function firstNonEmpty(...values) {
    return values.find((value) => typeof value === 'string' && value.trim()) || '';
}

function buildWardFromFeature(feature, fallbackId) {
    const properties = feature?.properties || {};
    const inferredId = extractAdminWardId(firstNonEmpty(
        properties.name,
        properties.ward,
        properties.ward_name,
        properties.wardName
    ));
    const id = inferredId || fallbackId;
    const nameEn = firstNonEmpty(
        properties.nameEn,
        properties.name_en,
        properties.wardNameEn,
        properties.ward_name_en,
        properties.ward,
        properties.name,
        `Ward ${id}`
    );
    const nameMr = firstNonEmpty(
        properties.nameMr,
        properties.name_mr,
        properties.wardNameMr,
        properties.ward_name_mr,
        nameEn
    );
    const officeName = firstNonEmpty(
        properties.officeName,
        properties.office_name,
        `${nameEn} Ward Office`
    );
    const officeAddress = firstNonEmpty(
        properties.officeAddress,
        properties.office_address,
        properties.address,
        'Address to be verified'
    );
    const officePhone = firstNonEmpty(
        properties.officePhone,
        properties.office_phone,
        properties.phone,
        'Phone to be verified'
    );
    const officeLat = parseNumber(
        properties.officeLat ?? properties.office_lat ?? properties.lat
    );
    const officeLng = parseNumber(
        properties.officeLng ?? properties.office_lng ?? properties.lng ?? properties.lon ?? properties.long
    );
    const fallbackCenter = centroidFromGeometry(feature?.geometry);

    return {
        id,
        nameEn,
        nameMr,
        officeName,
        officeAddress,
        officePhone,
        electoralWards: Array.isArray(properties.electoralWards)
            ? properties.electoralWards.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry) && entry > 0)
            : [],
        officeLat: officeLat ?? fallbackCenter.lat ?? 0,
        officeLng: officeLng ?? fallbackCenter.lng ?? 0,
    };
}

function buildWardMasterFromGeoJson(geoJson, sourceUrl = '') {
    const features = Array.isArray(geoJson?.features) ? geoJson.features : [];
    if (!features.length) {
        throw new Error('GeoJSON has no features');
    }

    const wards = features.map((feature, index) => buildWardFromFeature(feature, index + 1));
    const today = new Date().toISOString().slice(0, 10);

    return {
        wardDataSource: {
            source: 'Imported from open-source GeoJSON',
            url: sourceUrl || 'https://example.com/geojson',
            lastVerifiedOn: today,
            notes: 'Review office names, addresses, phones, and Marathi names after import.',
        },
        wards,
    };
}

export function parseWardMasterInput(payload) {
    return normalizeWardMaster(payload);
}

export function buildWardMasterFromRemoteData(remoteData, sourceUrl = '') {
    if (remoteData?.wardDataSource && Array.isArray(remoteData?.wards)) {
        return normalizeWardMaster(remoteData);
    }

    if (Array.isArray(remoteData?.wards)) {
        const today = new Date().toISOString().slice(0, 10);
        return normalizeWardMaster({
            wardDataSource: {
                source: 'Imported ward list',
                url: sourceUrl || 'https://example.com/wards',
                lastVerifiedOn: today,
                notes: 'Imported without explicit wardDataSource.',
            },
            wards: remoteData.wards,
        });
    }

    if (Array.isArray(remoteData)) {
        const today = new Date().toISOString().slice(0, 10);
        return normalizeWardMaster({
            wardDataSource: {
                source: 'Imported ward array',
                url: sourceUrl || 'https://example.com/wards',
                lastVerifiedOn: today,
                notes: 'Imported from array payload.',
            },
            wards: remoteData,
        });
    }

    if (remoteData?.type === 'FeatureCollection') {
        return normalizeWardMaster(buildWardMasterFromGeoJson(remoteData, sourceUrl));
    }

    throw new Error('Unsupported remote ward data format. Expected ward-master JSON, array of wards, or GeoJSON FeatureCollection.');
}

export async function getWardMaster() {
    const collection = await getCollection('wardMaster');
    const existing = await collection.findOne({ id: WARD_MASTER_DOC_ID });

    if (existing) {
        const { _id, ...rest } = existing;
        return normalizeWardMaster(rest);
    }

    const seeded = normalizeWardMaster(defaultWardMaster);

    await collection.insertOne({
        id: WARD_MASTER_DOC_ID,
        ...seeded,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    });

    return seeded;
}

export async function saveWardMaster(payload, updatedBy = 'system') {
    const normalized = normalizeWardMaster(payload);
    const collection = await getCollection('wardMaster');
    const now = new Date().toISOString();

    await collection.updateOne(
        { id: WARD_MASTER_DOC_ID },
        {
            $set: {
                id: WARD_MASTER_DOC_ID,
                wardDataSource: normalized.wardDataSource,
                wards: normalized.wards,
                updatedAt: now,
                updatedBy,
            },
            $setOnInsert: {
                createdAt: now,
            },
        },
        { upsert: true }
    );

    return normalized;
}
