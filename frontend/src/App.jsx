import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner.jsx";
import { Toaster } from "@/components/ui/toaster.jsx";
import { TooltipProvider } from "@/components/ui/tooltip.jsx";
import { LanguageProvider } from "@/contexts/LanguageContext.jsx";
import { AuthProvider } from "@/contexts/AuthContext.jsx";
import Navbar from "@/components/Navbar.jsx";
import Landing from "./pages/Landing.jsx";
import ReportIssue from "./pages/ReportIssue.jsx";
import IssueFeed from "./pages/IssueFeed.jsx";
import IssueDetail from "./pages/IssueDetail.jsx";
import IssuesMap from "./pages/IssuesMap.jsx";
import Leaderboard from "./pages/LeaderboardLive.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminLogin from "./pages/AdminLogin.jsx";
import EmployeeMaster from "./pages/EmployeeMaster.jsx";
import WardProfile from "./pages/WardProfileLive.jsx";
import Profile from "./pages/ProfileAuth.jsx";
import MyReports from "./pages/MyReports.jsx";
import WardMasterAdmin from "./pages/WardMasterAdmin.jsx";
import NotFound from "./pages/NotFound.jsx";
const queryClient = new QueryClient();
const App = () => (<QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Navbar />
            <main className="pb-20 md:pb-0">
              <Routes>
                <Route path="/" element={<Landing />}/>
                <Route path="/report" element={<ReportIssue />}/>
                <Route path="/issues" element={<IssueFeed />}/>
                <Route path="/issues/:id" element={<IssueDetail />}/>
                <Route path="/map" element={<IssuesMap />}/>
                <Route path="/leaderboard" element={<Leaderboard />}/>
                <Route path="/ward/:id" element={<WardProfile />}/>
                <Route path="/employee" element={<AdminDashboard />}/>
                <Route path="/employee/master" element={<EmployeeMaster />}/>
                <Route path="/employee/ward-master" element={<WardMasterAdmin />}/>
                <Route path="/employee/login" element={<AdminLogin />}/>
                <Route path="/admin" element={<Navigate to="/employee" replace />}/>
                <Route path="/admin/ward-master" element={<Navigate to="/employee/ward-master" replace />}/>
                <Route path="/admin/login" element={<Navigate to="/employee/login" replace />}/>
                <Route path="/profile" element={<Profile />}/>
                <Route path="/my-reports" element={<MyReports />}/>
                <Route path="*" element={<NotFound />}/>
              </Routes>
            </main>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>);
export default App;
