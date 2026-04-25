import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';
import IssueCard from '@/components/IssueCard.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx';
import { FileText, Bookmark } from 'lucide-react';
import { fetchFollowedIssues, fetchMyIssues } from '@/lib/api.js';

export default function MyReports() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const [myIssues, setMyIssues] = useState([]);
    const [followedIssues, setFollowedIssues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('reported');

    useEffect(() => {
        if (!isAuthenticated) {
            navigate('/profile');
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                const [myRes, followedRes] = await Promise.all([
                    fetchMyIssues(),
                    fetchFollowedIssues(),
                ]);

                setMyIssues(myRes.issues || []);
                setFollowedIssues(followedRes.issues || []);
            } catch (error) {
                console.error('Failed to fetch reports:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [isAuthenticated, navigate]);

    if (!isAuthenticated) {
        return null;
    }

    return (
        <div className="mx-auto max-w-4xl px-4 py-8">
            <h1 className="mb-6 text-2xl font-bold">My Reports</h1>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="reported" className="gap-2">
                        <FileText className="h-4 w-4" />
                        My Reports ({myIssues.length})
                    </TabsTrigger>
                    <TabsTrigger value="following" className="gap-2">
                        <Bookmark className="h-4 w-4" />
                        Following ({followedIssues.length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="reported" className="mt-6">
                    {loading ? (
                        <p className="py-12 text-center text-muted-foreground">{t('common.loading')}</p>
                    ) : myIssues.length > 0 ? (
                        <div className="grid gap-4">
                            {myIssues.map((issue) => (
                                <IssueCard key={issue.id} issue={issue} />
                            ))}
                        </div>
                    ) : (
                        <div className="py-12 text-center">
                            <p className="text-muted-foreground mb-4">You haven't reported any issues yet</p>
                            <Button onClick={() => navigate('/report')}>Report an Issue</Button>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="following" className="mt-6">
                    {loading ? (
                        <p className="py-12 text-center text-muted-foreground">{t('common.loading')}</p>
                    ) : followedIssues.length > 0 ? (
                        <div className="grid gap-4">
                            {followedIssues.map((issue) => (
                                <IssueCard key={issue.id} issue={issue} />
                            ))}
                        </div>
                    ) : (
                        <div className="py-12 text-center">
                            <p className="text-muted-foreground mb-4">You're not following any issues yet</p>
                            <Button onClick={() => navigate('/issues')}>Browse Issues</Button>
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
