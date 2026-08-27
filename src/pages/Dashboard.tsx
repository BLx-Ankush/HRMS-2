import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  Clock, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  CheckCircle2,
  AlertCircle,
  ArrowRight
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAdminStats, useEmployeeStats, useActivities } from "@/hooks/hrms";

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data: stats } = useAdminStats();
  const { data: estats } = useEmployeeStats(user?.employeeId);
  const { data: activities = [] } = useActivities();

  return (
    <DashboardLayout title="Dashboard">
      <div className="space-y-6">
        {/* Welcome Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-display font-bold text-foreground">
              Welcome back, {user?.name?.split(" ")[0]}!
            </h2>
            <p className="text-sm text-muted-foreground">
              {isAdmin
                ? "Here's what's happening with your team today."
                : "Here's your work summary for today."}
            </p>
          </div>
          {!isAdmin && (
            <Button asChild className="bg-primary hover:bg-primary/90">
              <Link to="/attendance">
                <Clock className="mr-2 h-4 w-4" />
                Check In
              </Link>
            </Button>
          )}
        </div>

        {/* Stats Grid - Admin View */}
        {isAdmin ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-[hsl(var(--card-accent))] border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Total Employees</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-bold text-foreground">{stats?.totalEmployees}</div>
                <p className="text-[11px] text-muted-foreground">
                  Across all departments
                </p>
              </CardContent>
            </Card>
            <Card className="bg-[hsl(var(--card-accent))] border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Present Today</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-bold text-foreground">{stats?.presentToday ?? 0}</div>
                <p className="text-[11px] text-muted-foreground">
                  {stats?.attendanceRate ?? 0}% attendance rate
                </p>
              </CardContent>
            </Card>
            <Card className="bg-[hsl(var(--card-accent))] border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Pending Requests</CardTitle>
                <AlertCircle className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-bold text-foreground">{stats?.pendingLeaveRequests ?? 0}</div>
                <p className="text-[11px] text-muted-foreground">Leave requests awaiting approval</p>
              </CardContent>
            </Card>
            <Card className="bg-[hsl(var(--card-accent))] border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Monthly Payroll</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-bold text-foreground">₹{(stats?.totalPayroll ?? 0).toLocaleString()}</div>
                <p className="text-[11px] text-muted-foreground">Total for this month</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-border shadow-soft">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Attendance Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-bold">{estats?.attendanceRate ?? 0}%</div>
                <p className="text-xs text-muted-foreground">This month</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-soft">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Leave Balance</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-bold">{estats?.leaveBalance ?? 0} days</div>
                <p className="text-xs text-muted-foreground">Available paid leave</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-soft">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-bold">{estats?.pendingRequests ?? 0}</div>
                <p className="text-xs text-muted-foreground">Awaiting approval</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-soft">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Next Payday</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-bold">{estats?.nextPayday ?? "—"}</div>
                <p className="text-xs text-muted-foreground">Upcoming</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Quick Actions & Recent Activity */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Quick Actions */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display">Quick Actions</CardTitle>
              <CardDescription className="text-xs">Common tasks and shortcuts</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {isAdmin ? (
                <>
                  <Link
                    to="/employees"
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                        <Users className="h-4 w-4 text-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Manage Employees</p>
                        <p className="text-[11px] text-muted-foreground">View and edit employee records</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </Link>
                  <Link
                    to="/leave"
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                        <Calendar className="h-4 w-4 text-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Leave Approvals</p>
                        <p className="text-[11px] text-muted-foreground">{stats?.pendingLeaveRequests ?? 0} pending requests</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </Link>
                  <Link
                    to="/attendance"
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                        <Clock className="h-4 w-4 text-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">View Attendance</p>
                        <p className="text-[11px] text-muted-foreground">Daily attendance records</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/profile"
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                        <Users className="h-4 w-4 text-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">View Profile</p>
                        <p className="text-[11px] text-muted-foreground">View and update your details</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </Link>
                  <Link
                    to="/leave"
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                        <Calendar className="h-4 w-4 text-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Request Leave</p>
                        <p className="text-[11px] text-muted-foreground">Submit a new leave request</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </Link>
                  <Link
                    to="/payroll"
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                        <DollarSign className="h-4 w-4 text-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">View Payroll</p>
                        <p className="text-[11px] text-muted-foreground">Check your salary details</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </Link>
                </>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="bg-[hsl(var(--card-accent))] border-none shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display">Recent Activity</CardTitle>
              <CardDescription className="text-xs">Latest updates and actions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recent activity.</p>
                ) : (
                  activities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className={`mt-1.5 h-1.5 w-1.5 rounded-full ${
                      activity.type === "leave" 
                        ? "bg-warning" 
                        : activity.type === "attendance" 
                          ? "bg-primary" 
                          : activity.type === "welcome"
                            ? "bg-success"
                            : "bg-success"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">
                        <span className="font-medium">{activity.user}</span>{" "}
                        <span className="text-muted-foreground">{activity.action}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
