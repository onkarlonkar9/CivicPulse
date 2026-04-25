import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { getWardScoreTier } from '@/lib/wardMetrics.js';

const WardHeatmap = ({ wards }) => {
    const { language, t } = useTranslation();
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const layerRef = useRef(null);
    const visibleWards = useMemo(() => wards || [], [wards]);
    const legendItems = [
        { label: t('heatmap.excellent'), color: '#10b981' },
        { label: t('heatmap.good'), color: '#84cc16' },
        { label: t('heatmap.average'), color: '#f59e0b' },
        { label: t('heatmap.critical'), color: '#ef4444' },
        { label: t('heatmap.noData'), color: '#94a3b8' },
    ];

    useEffect(() => {
        if (!mapRef.current) {
            return undefined;
        }

        let cancelled = false;

        async function renderMap() {
            const [L, geoJsonResponse] = await Promise.all([
                import('leaflet'),
                fetch('/pune-admin-wards.geojson'),
            ]);

            if (!geoJsonResponse.ok) {
                throw new Error('Failed to load ward boundary map');
            }

            const geoJson = await geoJsonResponse.json();

            if (cancelled || !mapRef.current) {
                return;
            }

            const wardMap = new Map(visibleWards.map((ward) => [ward.id, ward]));

            if (!mapInstanceRef.current) {
                mapInstanceRef.current = L.map(mapRef.current, {
                    scrollWheelZoom: true,
                    zoomControl: true,
                }).setView([18.5204, 73.8567], 12);

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap',
                    opacity: 0.7,
                }).addTo(mapInstanceRef.current);
            }

            if (layerRef.current) {
                layerRef.current.remove();
            }

            layerRef.current = L.geoJSON(geoJson, {
                style: (feature) => {
                    const match = /Admin Ward\s*(\d+)/i.exec(feature?.properties?.name || '');
                    const ward = match ? wardMap.get(Number(match[1])) : null;
                    const tier = getWardScoreTier(ward?.score ?? null);

                    return {
                        color: '#ffffff',
                        weight: 1.5,
                        fillColor: tier.fill,
                        fillOpacity: ward?.score == null ? 0.35 : 0.65,
                    };
                },
                onEachFeature: (feature, layer) => {
                    const match = /Admin Ward\s*(\d+)/i.exec(feature?.properties?.name || '');
                    const ward = match ? wardMap.get(Number(match[1])) : null;

                    if (!ward) {
                        return;
                    }

                    const tier = getWardScoreTier(ward.score);
                    const wardName = language === 'mr' ? ward.nameMr : ward.nameEn;
                    const resolutionRate = ward.resolutionRate == null ? t('common.notAvailable') : `${ward.resolutionRate}%`;
                    layer.bindPopup(`
                        <div style="min-width:220px;">
                          <strong style="font-size:14px;">${wardName}</strong><br/>
                          <span style="font-size:12px;color:#475569;">${ward.officeName}</span><br/>
                          <span style="display:inline-block;margin-top:6px;font-size:24px;font-weight:700;color:${tier.fill};">${ward.score ?? t('common.notAvailable')}</span><br/>
                          <span style="font-size:12px;">${t('leaderboard.open')}: ${ward.openIssues} | ${t('leaderboard.resolvedIssues')}: ${ward.resolvedIssues}</span><br/>
                          <span style="font-size:12px;">${t('ward.resolutionRate')}: ${resolutionRate}</span><br/>
                          <a href="/ward/${ward.id}" style="display:inline-block;margin-top:8px;padding:5px 10px;background:#ea580c;color:#fff;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;">${t('ward.viewDetails')}</a>
                        </div>
                    `);
                },
            }).addTo(mapInstanceRef.current);

            setTimeout(() => {
                mapInstanceRef.current?.invalidateSize();
            }, 200);
        }

        renderMap().catch((error) => {
            console.error(error);
        });

        return () => {
            cancelled = true;
            if (layerRef.current) {
                layerRef.current.remove();
                layerRef.current = null;
            }
        };
    }, [visibleWards, language, t]);

    useEffect(() => () => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
        }
    }, []);

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
                {legendItems.map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-muted-foreground">{item.label}</span>
                    </div>
                ))}
            </div>

            <div ref={mapRef} style={{ height: '500px', width: '100%' }} className="overflow-hidden rounded-xl border" />
        </div>
    );
};

export default WardHeatmap;
