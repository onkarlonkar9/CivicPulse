import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.jsx';
import { ScrollArea } from '@/components/ui/scroll-area.jsx';
import { Badge } from '@/components/ui/badge.jsx';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export default function NotificationBell() {
    const { isAuthenticated, token } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!isAuthenticated || !token) return;

        const fetchUnreadCount = async () => {
            try {
                const response = await fetch(`${API_BASE}/api/notifications/unread-count`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await response.json();
                setUnreadCount(data.count || 0);
            } catch (error) {
                console.error('Failed to fetch unread count:', error);
            }
        };

        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, 30000);
        return () => clearInterval(interval);
    }, [isAuthenticated, token]);

    const fetchNotifications = async () => {
        if (!token) return;
        try {
            const response = await fetch(`${API_BASE}/api/notifications`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json();
            setNotifications(data.notifications || []);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        }
    };

    const markAsRead = async (notificationId) => {
        if (!token) return;
        try {
            await fetch(`${API_BASE}/api/notifications/${notificationId}/read`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` },
            });
            setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Failed to mark as read:', error);
        }
    };

    const handleOpenChange = (isOpen) => {
        setOpen(isOpen);
        if (isOpen) {
            fetchNotifications();
        }
    };

    if (!isAuthenticated) return null;

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <Badge className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full px-1 text-xs">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <div className="border-b p-3">
                    <h3 className="font-semibold">Notifications</h3>
                </div>
                <ScrollArea className="h-[320px]">
                    {notifications.length === 0 ? (
                        <div className="p-6 text-center text-sm text-muted-foreground">
                            No notifications yet
                        </div>
                    ) : (
                        <div className="divide-y">
                            {notifications.map((notif) => (
                                <button
                                    key={notif.id}
                                    onClick={() => markAsRead(notif.id)}
                                    className={`w-full p-3 text-left transition-colors hover:bg-muted ${!notif.read ? 'bg-blue-50/50' : ''}`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1">
                                            <p className="text-sm font-medium">{notif.title}</p>
                                            <p className="text-xs text-muted-foreground">{notif.message}</p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {new Date(notif.createdAt).toLocaleString()}
                                            </p>
                                        </div>
                                        {!notif.read && (
                                            <div className="h-2 w-2 rounded-full bg-blue-500" />
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}
