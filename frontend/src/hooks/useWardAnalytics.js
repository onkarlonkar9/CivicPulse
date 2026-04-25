import { useEffect, useState } from 'react';
import { fetchWardAnalytics } from '@/lib/api.js';

export function useWardAnalytics() {
    const [wards, setWards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;

        fetchWardAnalytics()
            .then((response) => {
                if (!active) {
                    return;
                }

                setWards(response.wards || []);
                setError('');
            })
            .catch((loadError) => {
                if (!active) {
                    return;
                }

                setError(loadError.message);
            })
            .finally(() => {
                if (active) {
                    setLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, []);

    return { wards, loading, error };
}
