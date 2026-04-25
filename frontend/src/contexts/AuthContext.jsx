import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchCurrentUser, login as loginRequest, register as registerRequest } from '@/lib/api.js';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [token, setToken] = useState(() => localStorage.getItem('civicpulse_token'));

    useEffect(() => {
        let isMounted = true;
        const token = localStorage.getItem('civicpulse_token');

        if (!token) {
            setLoading(false);
            return;
        }

        fetchCurrentUser()
            .then((response) => {
                if (isMounted) {
                    setUser(response.user);
                }
            })
            .catch(() => {
                localStorage.removeItem('civicpulse_token');
                if (isMounted) {
                    setToken(null);
                }
                if (isMounted) {
                    setUser(null);
                }
            })
            .finally(() => {
                if (isMounted) {
                    setLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    const value = useMemo(() => ({
        user,
        loading,
        isAuthenticated: Boolean(user),
        isAdmin: ['admin', 'super-admin'].includes(user?.role),
        isSuperAdmin: user?.role === 'super-admin',
        setSession(response) {
            localStorage.setItem('civicpulse_token', response.token);
            setToken(response.token);
            setUser(response.user);
            return response;
        },
        async login(credentials) {
            const response = await loginRequest(credentials);
            localStorage.setItem('civicpulse_token', response.token);
            setToken(response.token);
            setUser(response.user);
            return response;
        },
        async register(payload) {
            const response = await registerRequest(payload);
            localStorage.setItem('civicpulse_token', response.token);
            setToken(response.token);
            setUser(response.user);
            return response;
        },
        logout() {
            localStorage.removeItem('civicpulse_token');
            setToken(null);
            setUser(null);
        },
        token,
    }), [loading, token, user]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};
