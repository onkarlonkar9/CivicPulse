import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { fetchDeptAnalytics, fetchTrends } from '@/lib/api.js';

export default function AdvancedAnalytics() {
    const { data: deptData, isLoading: loadingDepts } = useQuery({
        queryKey: ['deptAnalytics'],
        queryFn: fetchDeptAnalytics,
    });

    const { data: trendData, isLoading: loadingTrends } = useQuery({
        queryKey: ['trends'],
        queryFn: fetchTrends,
    });

    if (loadingDepts || loadingTrends) return <div className="py-10 text-center text-muted-foreground">Loading Analytics...</div>;

    return (
        <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Department Performance</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={deptData?.departments || []} layout="vertical" margin={{ left: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={100} fontSize={12} />
                                <Tooltip cursor={{ fill: 'transparent' }} />
                                <Legend />
                                <Bar dataKey="resolved" stackId="a" fill="#10b981" name="Resolved" radius={[0, 4, 4, 0]} />
                                <Bar dataKey="open" stackId="a" fill="#f59e0b" name="Open" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Issue Trends (30 Days)</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData?.trends || []}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="date" fontSize={10} tickFormatter={(val) => val.split('-').slice(1).join('/')} />
                                <YAxis fontSize={12} />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="created" stroke="#3b82f6" name="New Issues" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="resolved" stroke="#10b981" name="Resolved" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Department SLA Compliance</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                        {(deptData?.departments || []).map(dept => (
                            <div key={dept.name} className="flex items-center justify-between rounded-lg border p-4">
                                <div>
                                    <p className="font-semibold">{dept.name}</p>
                                    <p className="text-sm text-muted-foreground">Avg Resolution: {dept.avgResolutionTime || 'N/A'}h</p>
                                </div>
                                <div className="text-right">
                                    <p className={`text-lg font-bold ${dept.slaComplianceRate > 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                        {dept.slaComplianceRate}%
                                    </p>
                                    <p className="text-[10px] uppercase text-muted-foreground">SLA Compliance</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
