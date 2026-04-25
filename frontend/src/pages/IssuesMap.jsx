import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import 'leaflet.heat';
import './IssuesMap.css';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { Layers, MapPin } from 'lucide-react';
import { fetchIssues, fetchMeta } from '@/lib/api.js';
import { getCategoryLabel } from '@/lib/categoryLabel.js';

const PUNE_CENTER = [18.5204, 73.8567];

const statusColors = {
    new: '#ef4444',
    ack: '#f59e0b',
    inprog: '#3b82f6',
    resolved: '#10b981',
    verified: '#059669',
    closed: '#6b7280',
    reopened: '#dc2626',
    escalated: '#7c3aed',
};

function createCustomIcon(status, count) {
    const color = statusColors[status] || '#6b7280';
    const size = count > 1 ? 40 : 32;
    
    return L.divIcon({
        html: `
            <div style="
                background: ${color};
                width: ${size}px;
                height: ${size}px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: ${count > 1 ? '14px' : '12px'};
            ">
                ${count > 1 ? count : ''}
            </div>
        `,
        className: 'custom-marker-icon',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
}

function MapController({ issues, viewMode, statusFilter, categoryFilter }) {
    const map = useMap();
    const markersRef = useRef(null);
    const heatLayerRef = useRef(null);

    useEffect(() => {
        if (markersRef.current) {
            map.removeLayer(markersRef.current);
            markersRef.current = null;
        }
        if (heatLayerRef.current) {
            map.removeLayer(heatLayerRef.current);
            heatLayerRef.current = null;
        }

        const filteredIssues = issues.filter(issue => {
            if (statusFilter !== 'all' && issue.status !== statusFilter) return false;
            if (categoryFilter !== 'all' && String(issue.category) !== categoryFilter) return false;
            return true;
        });

        if (viewMode === 'markers') {
            const markers = L.markerClusterGroup({
                maxClusterRadius: 60,
                spiderfyOnMaxZoom: true,
                showCoverageOnHover: false,
                zoomToBoundsOnClick: true,
                iconCreateFunction: (cluster) => {
                    const count = cluster.getChildCount();
                    const markers = cluster.getAllChildMarkers();
                    const statuses = markers.map(m => m.options.issueStatus);
                    const mostCommonStatus = statuses.sort((a, b) =>
                        statuses.filter(s => s === a).length - statuses.filter(s => s === b).length
                    ).pop();
                    
                    const color = statusColors[mostCommonStatus] || '#6b7280';
                    const size = Math.min(50 + (count / 10), 70);
                    
                    return L.divIcon({
                        html: `
                            <div style="
                                background: ${color};
                                width: ${size}px;
                                height: ${size}px;
                                border-radius: 50%;
                                border: 4px solid white;
                                box-shadow: 0 3px 12px rgba(0,0,0,0.4);
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                color: white;
                                font-weight: bold;
                                font-size: 16px;
                            ">
                                ${count}
                            </div>
                        `,
                        className: 'custom-cluster-icon',
                        iconSize: [size, size],
                    });
                },
            });

            filteredIssues.forEach(issue => {
                if (issue.lat && issue.lng) {
                    const marker = L.marker([issue.lat, issue.lng], {
                        icon: createCustomIcon(issue.status, 1),
                        issueStatus: issue.status,
                    });
                    
                    marker.bindPopup(`
                        <div style="min-width: 200px;">
                            <img src="${issue.imageUrl}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 8px; margin-bottom: 8px;" />
                            <div style="font-weight: 600; margin-bottom: 4px;">${issue.title}</div>
                            <div style="font-size: 12px; color: #666; margin-bottom: 8px;">${issue.id}</div>
                            <div style="font-size: 12px; color: #666;">${issue.wardName}</div>
                            <a href="/issues/${issue.id}" style="display: inline-block; margin-top: 8px; padding: 4px 12px; background: #3b82f6; color: white; text-decoration: none; border-radius: 4px; font-size: 12px;">View Details</a>
                        </div>
                    `);
                    
                    markers.addLayer(marker);
                }
            });

            map.addLayer(markers);
            markersRef.current = markers;

            if (filteredIssues.length > 0) {
                const bounds = L.latLngBounds(filteredIssues.map(i => [i.lat, i.lng]));
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
            }
        } else if (viewMode === 'heatmap') {
            const heatData = filteredIssues
                .filter(issue => issue.lat && issue.lng)
                .map(issue => {
                    const intensity = issue.status === 'new' ? 1.0 : 
                                    issue.status === 'ack' ? 0.8 :
                                    issue.status === 'inprog' ? 0.6 : 0.3;
                    return [issue.lat, issue.lng, intensity];
                });

            if (heatData.length > 0) {
                const heat = L.heatLayer(heatData, {
                    radius: 25,
                    blur: 15,
                    maxZoom: 17,
                    max: 1.0,
                    gradient: {
                        0.0: '#3b82f6',
                        0.5: '#f59e0b',
                        1.0: '#ef4444',
                    },
                });
                
                map.addLayer(heat);
                heatLayerRef.current = heat;

                const bounds = L.latLngBounds(filteredIssues.map(i => [i.lat, i.lng]));
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
            }
        }

        return () => {
            if (markersRef.current) {
                map.removeLayer(markersRef.current);
            }
            if (heatLayerRef.current) {
                map.removeLayer(heatLayerRef.current);
            }
        };
    }, [map, issues, viewMode, statusFilter, categoryFilter]);

    return null;
}

export default function IssuesMap() {
    const { t } = useTranslation();
    const [issues, setIssues] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('markers');
    const [statusFilter, setStatusFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const [issuesRes, metaRes] = await Promise.all([
                    fetchIssues(),
                    fetchMeta(),
                ]);
                setIssues(issuesRes.issues || []);
                setCategories(metaRes.categories || []);
            } catch (error) {
                console.error('Failed to load map data:', error);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    const filteredCount = issues.filter(issue => {
        if (statusFilter !== 'all' && issue.status !== statusFilter) return false;
        if (categoryFilter !== 'all' && String(issue.category) !== categoryFilter) return false;
        return true;
    }).length;

    const statuses = ['all', 'new', 'ack', 'inprog', 'resolved', 'escalated'];

    return (
        <div className="relative h-[calc(100vh-4rem)] md:h-[calc(100vh-5rem)]">
            <div className="absolute top-4 left-4 right-4 z-[1000] flex flex-col gap-3 md:flex-row md:items-start">
                <Card className="flex-1 shadow-lg">
                    <CardContent className="p-3">
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                            <Select value={viewMode} onValueChange={setViewMode}>
                                <SelectTrigger className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="z-[2000]">
                                    <SelectItem value="markers">
                                        <div className="flex items-center gap-2">
                                            <MapPin className="h-4 w-4" />
                                            Markers
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="heatmap">
                                        <div className="flex items-center gap-2">
                                            <Layers className="h-4 w-4" />
                                            Heatmap
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent className="z-[2000]">
                                    {statuses.map(status => (
                                        <SelectItem key={status} value={status}>
                                            {status === 'all' ? 'All Status' : t(`status.${status}`)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Category" />
                                </SelectTrigger>
                                <SelectContent className="z-[2000]">
                                    <SelectItem value="all">All Categories</SelectItem>
                                    {categories.map(cat => (
                                        <SelectItem key={cat.id} value={String(cat.id)}>
                                            {getCategoryLabel(cat.id, t, categories)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <div className="flex items-center justify-center rounded-md border bg-muted px-3 text-sm font-medium">
                                {filteredCount} issues
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {loading ? (
                <div className="flex h-full items-center justify-center">
                    <p className="text-muted-foreground">{t('common.loading')}</p>
                </div>
            ) : (
                <MapContainer
                    center={PUNE_CENTER}
                    zoom={12}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={true}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MapController 
                        issues={issues} 
                        viewMode={viewMode}
                        statusFilter={statusFilter}
                        categoryFilter={categoryFilter}
                    />
                </MapContainer>
            )}

            <div className="absolute bottom-4 right-4 z-[1000]">
                <Card className="shadow-lg">
                    <CardContent className="p-3">
                        <div className="space-y-2 text-xs">
                            <div className="font-semibold">Legend</div>
                            {viewMode === 'markers' ? (
                                <div className="space-y-1">
                                    {Object.entries(statusColors).map(([status, color]) => (
                                        <div key={status} className="flex items-center gap-2">
                                            <div style={{ background: color }} className="h-3 w-3 rounded-full border border-white" />
                                            <span>{t(`status.${status}`)}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <div className="h-3 w-8 rounded" style={{ background: 'linear-gradient(to right, #3b82f6, #f59e0b, #ef4444)' }} />
                                        <span>Low - High</span>
                                    </div>
                                    <p className="text-muted-foreground">Intensity based on status</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
