import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { MapPin } from 'lucide-react';

const MapPicker = ({ onLocationSelect, value = null, initialLat = 18.5204, initialLng = 73.8567 }) => {
    const { t } = useTranslation();
    const [position, setPosition] = useState(value);
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markerRef = useRef(null);

    useEffect(() => {
        setPosition(value);
    }, [value]);

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
                onLocationSelect(nextPosition.lat, nextPosition.lng);
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

            const map = L.map(mapRef.current, { scrollWheelZoom: true }).setView([initialLat, initialLng], 13);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '(c) OpenStreetMap',
            }).addTo(map);

            if (value) {
                markerRef.current = L.marker([value.lat, value.lng], { draggable: true }).addTo(map);
                attachDragHandler();
                map.setView([value.lat, value.lng], 15);
            }

            map.on('click', (event) => {
                const nextPosition = { lat: event.latlng.lat, lng: event.latlng.lng };

                setPosition(nextPosition);
                onLocationSelect(nextPosition.lat, nextPosition.lng);

                if (markerRef.current) {
                    markerRef.current.setLatLng([nextPosition.lat, nextPosition.lng]);
                } else {
                    markerRef.current = L.marker([nextPosition.lat, nextPosition.lng], { draggable: true }).addTo(map);
                    attachDragHandler();
                }
            });

            mapInstanceRef.current = map;
        });

        return () => {
            isMounted = false;

            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }

            markerRef.current = null;
        };
    }, [initialLat, initialLng, onLocationSelect, value]);

    useEffect(() => {
        const map = mapInstanceRef.current;

        if (!map || !position) {
            return;
        }

        if (markerRef.current) {
            markerRef.current.setLatLng([position.lat, position.lng]);
        }

        map.setView([position.lat, position.lng], Math.max(map.getZoom(), 15));
    }, [position]);

    useEffect(() => {
        const map = mapInstanceRef.current;

        if (!map) {
            return;
        }

        const handleResize = () => {
            window.requestAnimationFrame(() => {
                map.invalidateSize();
            });
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleResize);
        };
    }, []);

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {position ? `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}` : t('report.dropPin')}
            </div>
            <div ref={mapRef} className="h-[300px] w-full overflow-hidden rounded-xl border sm:h-[300px] lg:h-[360px]" />
        </div>
    );
};

export default MapPicker;
