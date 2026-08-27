import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, Calendar, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePayroll, useAdminStats, useGeneratePayroll } from "@/hooks/hrms";
import { useToast } from "@/hooks/use-toast";
import type { PayrollRecord } from "@/types/db";

const statusConfig: Record<string, { label: string; className: string }> = {
  paid: { label: "paid", className: "bg-success/10 text-success border-success/20" },
  pending: { label: "pending", className: "bg-warning/10 text-warning border-warning/20" },
  processing: { label: "processing", className: "bg-primary/10 text-primary border-primary/20" },
};

const currentMonthLabel = () =>
  new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

// Build a plain-text payslip and trigger a browser download.
function downloadPayslip(record: PayrollRecord) {
  const line = "-".repeat(44);
  const row = (label: string, value: string) => `${label.padEnd(28)}${value.padStart(16)}`;
  const text = [
    "DAYFLOW HRMS — PAYSLIP",
    line,
    row("Employee", record.employeeName),
    row("Employee ID", record.employeeId),
    row("Department", record.department || "—"),
    row("Month", record.month),
    line,
    row("Basic Salary", `INR ${record.basicSalary.toLocaleString()}`),
    row("Allowances", `+INR ${record.allowances.toLocaleString()}`),
    row("Deductions", `-INR ${record.deductions.toLocaleString()}`),
    line,
    row("Net Salary", `INR ${record.netSalary.toLocaleString()}`),
    row("Status", record.status),
    line,
    `Generated ${new Date().toLocaleString()}`,
  ].join("\n");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payslip-${record.employeeId}-${record.month.replace(/\s+/g, "-")}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Payroll() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const { data: payroll = [] } = usePayroll();
  const { data: stats } = useAdminStats();
  const generatePayroll = useGeneratePayroll();

  const handleGenerate = () => {
    generatePayroll.mutate(undefined, {
      onSuccess: (count) =>
        toast({ title: "Payroll generated", description: `Created ${count} payroll record(s) for ${currentMonthLabel()}.` }),
      onError: () => toast({ title: "Generation failed", description: "Please try again.", variant: "destructive" }),
    });
  };

  // Employee's own payroll history (hook returns newest first)
  const myPayroll = payroll.filter((p) => p.employeeId === user?.employeeId);
  const currentPayroll = myPayroll[0];
  const totalEarnings = currentPayroll
    ? currentPayroll.basicSalary + currentPayroll.allowances
    : 0;

  // Admin: current-month rows across all employees
  const monthLabel = currentMonthLabel();
  const currentMonthRows = payroll.filter((p) => p.month === monthLabel);
  const totalEmployees = stats?.totalEmployees ?? currentMonthRows.length;
  const employeesPaid = currentMonthRows.filter((p) => p.status === "paid").length;
  const pendingPayments = currentMonthRows.filter((p) => p.status !== "paid").length;
  const totalPayroll = stats?.totalPayroll ?? 0;

  return (
    <DashboardLayout title="Payroll">
      <div className="space-y-6">
        {/* Summary Cards */}
        {isAdmin ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-[hsl(var(--card-accent))] border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Total Payroll</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-display font-bold text-foreground">₹{totalPayroll.toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground">{monthLabel}</p>
              </CardContent>
            </Card>
            <Card className="bg-[hsl(var(--card-accent))] border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Employees Paid</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-display font-bold text-success">{employeesPaid} / {totalEmployees}</p>
                <p className="text-[11px] text-muted-foreground">This month</p>
              </CardContent>
            </Card>
            <Card className="bg-[hsl(var(--card-accent))] border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Pending Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-display font-bold text-foreground">{pendingPayments}</p>
                <p className="text-[11px] text-muted-foreground">Processing</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-3.5 w-3.5" />
                  Basic Salary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-display font-bold text-foreground">
                  ₹{(currentPayroll?.basicSalary ?? 0).toLocaleString()}
                </p>
                <p className="text-[11px] text-muted-foreground">Per month</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Allowances</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-display font-bold text-success">
                  +₹{(currentPayroll?.allowances ?? 0).toLocaleString()}
                </p>
                <p className="text-[11px] text-muted-foreground">This month</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Deductions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-display font-bold text-destructive">
                  -₹{(currentPayroll?.deductions ?? 0).toLocaleString()}
                </p>
                <p className="text-[11px] text-muted-foreground">Taxes & benefits</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Net Salary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-display font-bold text-primary">
                  ₹{(currentPayroll?.netSalary ?? 0).toLocaleString()}
                </p>
                <Badge variant="outline" className={statusConfig[currentPayroll?.status ?? "pending"].className}>
                  {statusConfig[currentPayroll?.status ?? "pending"].label}
                </Badge>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Payroll Details */}
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                <Calendar className="h-4 w-4 text-foreground" />
              </div>
              <div>
                <CardTitle className="text-base font-display">
                  {isAdmin ? "Employee Payroll" : "Payroll History"}
                </CardTitle>
                <CardDescription className="text-xs">
                  {isAdmin ? "Manage employee salary and payments" : "View your salary breakdown and history"}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={!currentPayroll}
                  onClick={() => currentPayroll && downloadPayslip(currentPayroll)}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download
                </Button>
              )}
              {isAdmin && (
                <Button
                  size="sm"
                  className="h-8 bg-primary hover:bg-primary/90 text-primary-foreground"
                  disabled={generatePayroll.isPending}
                  onClick={handleGenerate}
                >
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${generatePayroll.isPending ? "animate-spin" : ""}`} />
                  {generatePayroll.isPending ? "Generating…" : `Generate ${monthLabel}`}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isAdmin ? (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/30">
                      <TableHead className="text-xs font-medium">Employee ID</TableHead>
                      <TableHead className="text-xs font-medium">Name</TableHead>
                      <TableHead className="text-xs font-medium">Department</TableHead>
                      <TableHead className="text-xs font-medium">Basic Salary</TableHead>
                      <TableHead className="text-xs font-medium">Net Salary</TableHead>
                      <TableHead className="text-xs font-medium">Status</TableHead>
                      <TableHead className="text-xs font-medium text-right">Slip</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentMonthRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                          No payroll records for {monthLabel}. Click “Generate {monthLabel}” to create them.
                        </TableCell>
                      </TableRow>
                    ) : (
                      currentMonthRows.map((emp) => (
                        <TableRow key={emp.id}>
                          <TableCell className="text-sm font-medium">{emp.employeeId}</TableCell>
                          <TableCell className="text-sm">{emp.employeeName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{emp.department}</TableCell>
                          <TableCell className="text-sm">₹{emp.basicSalary.toLocaleString()}</TableCell>
                          <TableCell className="text-sm font-medium">₹{emp.netSalary.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${statusConfig[emp.status].className}`}>
                              {statusConfig[emp.status].label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => downloadPayslip(emp)}>
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <Tabs defaultValue="history">
                <TabsList className="h-8">
                  <TabsTrigger value="history" className="text-xs h-7">History</TabsTrigger>
                  <TabsTrigger value="breakdown" className="text-xs h-7">Current Breakdown</TabsTrigger>
                </TabsList>
                <TabsContent value="history" className="mt-4">
                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-secondary/30">
                          <TableHead className="text-xs font-medium">Month</TableHead>
                          <TableHead className="text-xs font-medium">Basic Salary</TableHead>
                          <TableHead className="text-xs font-medium">Allowances</TableHead>
                          <TableHead className="text-xs font-medium">Deductions</TableHead>
                          <TableHead className="text-xs font-medium">Net Salary</TableHead>
                          <TableHead className="text-xs font-medium">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {myPayroll.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                              No payroll history yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          myPayroll.map((record) => (
                            <TableRow key={record.id}>
                              <TableCell className="text-sm font-medium">{record.month}</TableCell>
                              <TableCell className="text-sm">₹{record.basicSalary.toLocaleString()}</TableCell>
                              <TableCell className="text-sm text-success">
                                +₹{record.allowances.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-sm text-destructive">
                                -₹{record.deductions.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-sm font-medium">
                                ₹{record.netSalary.toLocaleString()}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={statusConfig[record.status].className}>
                                  {statusConfig[record.status].label}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
                <TabsContent value="breakdown" className="mt-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Card className="border-border">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-display">Earnings</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Basic Salary</span>
                          <span className="font-medium">₹{(currentPayroll?.basicSalary ?? 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Allowances</span>
                          <span className="font-medium">₹{(currentPayroll?.allowances ?? 0).toLocaleString()}</span>
                        </div>
                        <div className="border-t pt-2 flex justify-between font-medium">
                          <span>Total Earnings</span>
                          <span className="text-success">₹{totalEarnings.toLocaleString()}</span>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-border">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-display">Deductions</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Deductions</span>
                          <span className="font-medium">₹{(currentPayroll?.deductions ?? 0).toLocaleString()}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground pt-1">
                          Includes PF, professional tax and other statutory deductions.
                        </p>
                        <div className="border-t pt-2 flex justify-between font-medium">
                          <span>Net Salary</span>
                          <span className="text-primary">₹{(currentPayroll?.netSalary ?? 0).toLocaleString()}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
