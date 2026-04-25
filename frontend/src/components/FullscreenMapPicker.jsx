import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { Button } from '@/components/ui/button.jsx';
import { X, ArrowRight } from 'lucide-react';

const FullscreenMapPicker = ({ onLocationSelect, initialValue = null, onClose, initialLat = 18.5204, initialLng = 73.8567 }) => {
    const { t } = useTranslation();
    const [position, setPosition] = useState(initialValue);
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markerRef = useRef(null);

    useEffect(() => {
        if (!mapRef.current || mapInstanceRef.current) {
            return;
        }

        let isMounted = true;

        const attachDragHandler = () => {
            if (!markerRef.current) {
                return;
            }

            markerRef.current.on('dragend', () => {
                const latlng = markerRef.current.getLatLng();
                const nextPosition = { lat: latlng.lat, lng: latlng.lng };
                setPosition(nextPosition);
            });
        };

        import('leaflet').then((L) => {
            if (!isMounted || !mapRef.current) {
                return;
            }

            delete L.Icon.Default.prototype._getIconUrl;
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
                iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
            });

            const startLat = initialValue?.lat || initialLat;
            const startLng = initialValue?.lng || initialLng;

            const map = L.map(mapRef.current, { scrollWheelZoom: true }).setView([startLat, startLng], initialValue ? 15 : 13);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '(c) OpenStreetMap',
            }).addTo(map);

            if (initialValue) {
                markerRef.current = L.marker([initialValue.lat, initialValue.lng], { draggable: true }).addTo(map);
                attachDragHandler();
            }

            map.on('click', (event) => {
                const nextPosition = { lat: event.latlng.lat, lng: event.latlng.lng };
                setPosition(nextPosition);

                if (markerRef.current) {
                    markerRef.current.setLatLng([nextPosition.lat, nextPosition.lng]);
                } else {
                    markerRef.current = L.marker([nextPosition.lat, nextPosition.lng], { draggable: true }).addTo(map);
                    attachDragHandler();
                }
            });

            mapInstanceRef.current = map;

            // Invalidate size after a short delay to ensure proper rendering
            setTimeout(() => {
                if (map) {
                    map.invalidateSize();
                }
            }, 100);
        });

        return () => {
            isMounted = false;

            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }

            markerRef.current = null;
        };
    }, [initialLat, initialLng, initialValue]);

    const handleConfirm = () => {
        if (position) {
            onLocationSelect(position.lat, position.lng);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b bg-background p-4 shrink-0">
                <h2 className="text-lg font-semibold">{t('report.selectLocation')}</h2>
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <X className="h-5 w-5" />
                </Button>
            </div>

            {/* Map */}
            <div ref={mapRef} className="flex-1 w-full" />

            {/* Footer */}
            <div className="border-t bg-background p-4 shrink-0">
                <div className="mb-3 text-center text-sm text-muted-foreground">
                    {position ? (
                        <span>
                            {t('report.latitude')}: {position.lat.toFixed(6)}, {t('report.longitude')}: {position.lng.toFixed(6)}
                        </span>
                    ) : (
                        <span>{t('report.mapHint')}</span>
                    )}
                </div>
                <div className="flex gap-3">
                    <Button 
                        onClick={onClose} 
                        variant="outline"
                        className="flex-1 gap-2"
                        size="lg"
                    >
                        <X className="h-5 w-5" />
                        {t('common.exit')}
                    </Button>
                    <Button 
                        onClick={handleConfirm} 
                        disabled={!position} 
                        className="flex-1 gap-2"
                        size="lg"
                    >
                        {t('report.next')}
                        <ArrowRight className="h-5 w-5" />
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default FullscreenMapPicker;
