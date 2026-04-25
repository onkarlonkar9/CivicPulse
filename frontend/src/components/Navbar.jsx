import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import LanguageToggle from './LanguageToggle.jsx';
import NotificationBell from './NotificationBell.jsx';
import { Home, FileWarning, ListChecks, Trophy, Shield, User } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';
import logo from "../assets/civicpulse_logo.svg";

const Navbar = () => {
    const { t } = useTranslation();
    const location = useLocation();
    const { isAdmin } = useAuth();

    const desktopLinks = [
        { to: '/', label: t('nav.home'), icon: Home },
        { to: '/report', label: t('nav.report'), icon: FileWarning },
        { to: '/issues', label: t('nav.issues'), icon: ListChecks },
        { to: '/leaderboard', label: t('nav.leaderboard'), icon: Trophy },
        ...(isAdmin ? [{ to: '/admin', label: t('nav.admin'), icon: Shield }] : []),
        { to: '/profile', label: t('nav.profile'), icon: User },
    ];

    const mobileTabs = [
        { to: '/report', label: t('nav.report'), icon: FileWarning },
        { to: '/issues', label: t('nav.issues'), icon: ListChecks },
        { to: '/', label: t('nav.home'), icon: Home, emphasize: true },
        { to: '/leaderboard', label: t('nav.leaderboard'), icon: Trophy },
        { to: isAdmin ? '/admin' : '/profile', label: isAdmin ? t('nav.admin') : t('nav.profile'), icon: isAdmin ? Shield : User },
    ];

    const isPathActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);
    const isTabActive = (to) => {
        if (to === '/profile' || to === '/admin') {
            return location.pathname.startsWith('/profile') || location.pathname.startsWith('/admin');
        }

        return isPathActive(to);
    };

    useEffect(() => {
    }, [location.pathname, isAdmin]);

    return (
        <>
            <nav className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-16 items-center justify-between md:h-20">
          <Link to="/" className="flex items-center gap-2">
            <img className="h-12 w-auto md:h-16" src={logo} alt="logo" />
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-3 md:flex">
            {desktopLinks.map(({ to, label, icon: Icon }) => (<Link key={to} to={to}>
                <Button variant={isPathActive(to) ? 'default' : 'ghost'} size="sm" className="gap-1.5">
                  <Icon className="h-4 w-4"/>
                  {label}
                </Button>
              </Link>))}
          </div>

          <div className="flex items-center gap-2 md:gap-0">
            <NotificationBell />
            <LanguageToggle />
          </div>
        </div>
      </div>
    </nav>

            <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 px-2 py-2 backdrop-blur md:hidden">
                <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
                    {mobileTabs.map(({ to, label, icon: Icon, emphasize }) => {
                        const active = isTabActive(to);

                        return (
                            <Link key={label} to={to} className="flex justify-center">
                                <button
                                    type="button"
                                    className={`flex w-full flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[11px] ${
                                        emphasize
                                            ? active
                                                ? 'bg-primary text-primary-foreground shadow-md'
                                                : 'bg-primary/90 text-primary-foreground'
                                            : active
                                                ? 'bg-muted text-foreground'
                                                : 'text-muted-foreground'
                                    }`}
                                >
                                    <Icon className={`${emphasize ? 'h-5 w-5' : 'h-4 w-4'} mb-0.5`} />
                                    <span className="line-clamp-1">{label}</span>
                                </button>
                            </Link>
                        );
                    })}
                </div>
            </nav>

        </>
    );
};
export default Navbar;
