import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner.jsx";
import { Toaster } from "@/components/ui/toaster.jsx";
import { TooltipProvider } from "@/components/ui/tooltip.jsx";
import { LanguageProvider } from "@/contexts/LanguageContext.jsx";
import { AuthProvider } from "@/contexts/AuthContext.jsx";
import Navbar from "@/components/Navbar.jsx";

const Landing = lazy(() => import("./pages/Landing.jsx"));
const ReportIssue = lazy(() => import("./pages/ReportIssue.jsx"));
const IssueFeed = lazy(() => import("./pages/IssueFeed.jsx"));
const IssueDetail = lazy(() => import("./pages/IssueDetail.jsx"));
const IssuesMap = lazy(() => import("./pages/IssuesMap.jsx"));
const Leaderboard = lazy(() => import("./pages/LeaderboardLive.jsx"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard.jsx"));
const AdminLogin = lazy(() => import("./pages/AdminLogin.jsx"));
const EmployeeMaster = lazy(() => import("./pages/EmployeeMaster.jsx"));
const WardProfile = lazy(() => import("./pages/WardProfileLive.jsx"));
const Profile = lazy(() => import("./pages/ProfileAuth.jsx"));
const MyReports = lazy(() => import("./pages/MyReports.jsx"));
const WardMasterAdmin = lazy(() => import("./pages/WardMasterAdmin.jsx"));
const TaskBoard = lazy(() => import("./pages/TaskBoard.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));
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
              <Suspense fallback={<div className="mx-auto max-w-lg px-4 py-8 text-center text-muted-foreground">Loading...</div>}>
                <Routes>
                  <Route path="/" element={<Landing />}/>
                  <Route path="/report" element={<ReportIssue />}/>
                  <Route path="/issues" element={<IssueFeed />}/>
                  <Route path="/issues/:id" element={<IssueDetail />}/>
                  <Route path="/map" element={<IssuesMap />}/>
                  <Route path="/leaderboard" element={<Leaderboard />}/>
                  <Route path="/ward/:id" element={<WardProfile />}/>
                  <Route path="/employee" element={<AdminDashboard />}/>
                  <Route path="/employee/tasks" element={<TaskBoard />}/>
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
              </Suspense>
            </main>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>);
export default App;
