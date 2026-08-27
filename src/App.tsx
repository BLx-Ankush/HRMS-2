import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { RealtimeSync } from "@/hooks/useRealtimeSync";
import { WebMcpTools } from "@/hooks/useWebMcpTools";
import { AgentApprovalDialog } from "@/components/AgentApprovalDialog";
import { AgentPanel } from "@/components/AgentPanel";
import { WebMcpStatusBadge } from "@/components/WebMcpStatusBadge";
import { CanvasBridge } from "@/components/CanvasBridge";
import Index from "./pages/Index";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import Attendance from "./pages/Attendance";
import Leave from "./pages/Leave";
import TimeOff from "./pages/TimeOff";
import Payroll from "./pages/Payroll";
import Bonuses from "./pages/Bonuses";
import SalaryInfo from "./pages/SalaryInfo";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <RealtimeSync />
        <WebMcpTools />
        <AgentApprovalDialog />
        <AgentPanel />
        <WebMcpStatusBadge />
        <BrowserRouter>
          <CanvasBridge />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/leave" element={<Leave />} />
            <Route path="/time-off" element={<TimeOff />} />
            <Route path="/payroll" element={<Payroll />} />
            <Route path="/bonuses" element={<Bonuses />} />
            <Route path="/salary-info" element={<SalaryInfo />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
