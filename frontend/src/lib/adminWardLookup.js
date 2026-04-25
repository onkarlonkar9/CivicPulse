import { lookupWardByCoordinates } from '@/lib/api.js';

export async function findAdminWardByCoordinates(lat, lng) {
    const response = await lookupWardByCoordinates(lat, lng);
    return response.ward || null;
}
