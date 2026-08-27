import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Search, Plus, Mail, Phone, Building, Eye, Sparkles } from "lucide-react";
import { useEmployees, useAddEmployee } from "@/hooks/hrms";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useCanvas } from "@/hooks/useCanvas";
import { canvas } from "@/lib/webmcp/canvas";
import type { Employee } from "@/types/db";

const emptyForm = {
  name: "", email: "", employeeId: "", department: "", position: "",
  phone: "", status: "active" as Employee["status"], joinDate: "",
};

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-success/10 text-success border-success/20" },
  inactive: { label: "Inactive", className: "bg-muted text-muted-foreground border-muted" },
  on_leave: { label: "Leave", className: "bg-warning/10 text-warning border-warning/20" },
};

export default function Employees() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const { data: employees = [], isLoading } = useEmployees();
  const { directory, focusEmployeeId, pulse } = useCanvas();
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const { user } = useAuth();
  const { toast } = useToast();
  const addEmployee = useAddEmployee();
  const isAdmin = user?.role === "admin";

  const nextEmployeeId = () => {
    const nums = employees
      .map((e) => parseInt(String(e.id).replace(/\D/g, ""), 10))
      .filter((n) => !Number.isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return `EMP${String(next).padStart(3, "0")}`;
  };

  const openAdd = () => {
    setForm({ ...emptyForm, employeeId: nextEmployeeId(), joinDate: new Date().toISOString().slice(0, 10) });
    setAddOpen(true);
  };

  const handleAdd = () => {
    if (!form.name || !form.email || !form.employeeId || !form.department || !form.position) {
      toast({ title: "Missing fields", description: "Name, email, ID, department and position are required.", variant: "destructive" });
      return;
    }
    addEmployee.mutate(
      {
        employeeId: form.employeeId.trim(), name: form.name.trim(), email: form.email.trim(),
        phone: form.phone.trim(), department: form.department.trim(), position: form.position.trim(),
        status: form.status, joinDate: form.joinDate || new Date().toISOString().slice(0, 10),
      },
      {
        onSuccess: () => {
          setAddOpen(false);
          toast({ title: "Employee added", description: `${form.name} was added to the directory.` });
        },
        onError: (e: any) =>
          toast({
            title: "Could not add employee",
            description: String(e?.message ?? "").includes("duplicate")
              ? "That Employee ID already exists."
              : "Please try again.",
            variant: "destructive",
          }),
      }
    );
  };

  const filteredEmployees = employees.filter((emp) => {
    const q = searchQuery.toLowerCase();
    const matchesQuery =
      !q ||
      emp.name.toLowerCase().includes(q) ||
      emp.email.toLowerCase().includes(q) ||
      emp.department.toLowerCase().includes(q) ||
      emp.id.toLowerCase().includes(q);
    const matchesDept =
      !directory.department || emp.department.toLowerCase() === directory.department.toLowerCase();
    const matchesStatus = !directory.status || emp.status === directory.status;
    return matchesQuery && matchesDept && matchesStatus;
  });

  // --- Shared canvas: let agent tool calls drive this visible table ---
  // The agent's filter_directory / focus_employee tools write to the canvas
  // store; we mirror that into the real search box and scroll the row into
  // view, so the human watches their own screen change.
  const filterKey = `${directory.query}|${directory.department}|${directory.status}`;
  useEffect(() => {
    setSearchQuery(directory.query);
  }, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleIds = filteredEmployees.map((e) => e.id).join(",");
  useEffect(() => {
    if (!focusEmployeeId) return;
    const el = rowRefs.current[focusEmployeeId];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusEmployeeId, pulse, visibleIds]);

  const departments = [...new Set(employees.map((e) => e.department))];
  const activeCount = employees.filter((e) => e.status === "active").length;
  const onLeaveCount = employees.filter((e) => e.status === "on_leave").length;

  // Publish what is actually on screen so `get_page_context` can report it.
  useEffect(() => {
    canvas.publishContext({
      screen: "employees",
      totalEmployees: employees.length,
      visibleRowCount: filteredEmployees.length,
      visibleEmployees: filteredEmployees.slice(0, 25).map((e) => ({
        employeeId: e.id, name: e.name, department: e.department, status: e.status,
      })),
      searchBoxText: searchQuery,
      stats: { active: activeCount, onLeave: onLeaveCount, departments: departments.length },
    });
  }, [visibleIds, employees.length, searchQuery, activeCount, onLeaveCount, departments.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  return (
    <DashboardLayout title="Employees">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-[hsl(var(--card-accent))] border-none shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Total Employees</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-display font-bold text-foreground">{employees.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-[hsl(var(--card-accent))] border-none shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-display font-bold text-success">{activeCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-[hsl(var(--card-accent))] border-none shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">On Leave</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-display font-bold text-warning">{onLeaveCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-[hsl(var(--card-accent))] border-none shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Departments</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-display font-bold text-foreground">{departments.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Employee List */}
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                <Users className="h-4 w-4 text-foreground" />
              </div>
              <div>
                <CardTitle className="text-base font-display">Employee Directory</CardTitle>
                <CardDescription className="text-xs">Manage and view all employee records</CardDescription>
              </div>
            </div>
            {isAdmin && (
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={openAdd}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add Employee
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-display">Add Employee</DialogTitle>
                    <DialogDescription>Create a new employee record in the directory.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="emp-name">Full name *</Label>
                        <Input id="emp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="emp-id">Employee ID *</Label>
                        <Input id="emp-id" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="emp-email">Email *</Label>
                      <Input id="emp-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="emp-dept">Department *</Label>
                        <Input id="emp-dept" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="emp-pos">Position *</Label>
                        <Input id="emp-pos" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="emp-phone">Phone</Label>
                        <Input id="emp-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="emp-join">Join date</Label>
                        <Input id="emp-join" type="date" value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Employee["status"] })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="on_leave">On Leave</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                    <Button onClick={handleAdd} disabled={addEmployee.isPending}>
                      {addEmployee.isPending ? "Adding…" : "Add Employee"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            {/* Agent-applied view state — makes it obvious the agent changed this screen */}
            {(directory.department || directory.status || focusEmployeeId) && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium text-primary">Agent view</span>
                {focusEmployeeId && (
                  <Badge variant="outline" className="text-[10px]">focused {focusEmployeeId}</Badge>
                )}
                {directory.department && (
                  <Badge variant="outline" className="text-[10px]">dept: {directory.department}</Badge>
                )}
                {directory.status && (
                  <Badge variant="outline" className="text-[10px]">status: {directory.status}</Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 px-2 text-[11px]"
                  onClick={() => canvas.filterDirectory({})}
                >
                  Clear
                </Button>
              </div>
            )}

            {/* Search */}
            <div className="mb-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, department, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>

            {/* Table */}
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/30">
                    <TableHead className="text-xs font-medium">Employee</TableHead>
                    <TableHead className="text-xs font-medium">Department</TableHead>
                    <TableHead className="text-xs font-medium">Active</TableHead>
                    <TableHead className="text-xs font-medium w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : filteredEmployees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                        No employees found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEmployees.map((employee) => (
                      <TableRow
                        key={employee.id}
                        ref={(el) => { rowRefs.current[employee.id] = el; }}
                        className={
                          focusEmployeeId === employee.id
                            ? "agent-focus bg-primary/5"
                            : undefined
                        }
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-primary/10 text-primary font-medium text-xs">
                                {getInitials(employee.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium text-foreground">{employee.name}</p>
                              <p className="text-[11px] text-muted-foreground">{employee.id}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{employee.department}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 ${statusConfig[employee.status].className}`}>
                            {statusConfig[employee.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => setSelectedEmployee(employee)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md">
                              <DialogHeader>
                                <DialogTitle className="font-display">Employee Details</DialogTitle>
                                <DialogDescription>View employee information</DialogDescription>
                              </DialogHeader>
                              {selectedEmployee && (
                                <div className="space-y-6">
                                  <div className="flex items-center gap-4">
                                    <Avatar className="h-14 w-14">
                                      <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                                        {getInitials(selectedEmployee.name)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <h3 className="text-lg font-semibold">{selectedEmployee.name}</h3>
                                      <p className="text-sm text-muted-foreground">{selectedEmployee.id}</p>
                                      <Badge variant="outline" className={statusConfig[selectedEmployee.status].className}>
                                        {statusConfig[selectedEmployee.status].label}
                                      </Badge>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <div className="flex items-center gap-3 text-sm">
                                      <Mail className="h-4 w-4 text-muted-foreground" />
                                      <span>{selectedEmployee.email}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm">
                                      <Phone className="h-4 w-4 text-muted-foreground" />
                                      <span>{selectedEmployee.phone}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm">
                                      <Building className="h-4 w-4 text-muted-foreground" />
                                      <span>{selectedEmployee.department} - {selectedEmployee.position}</span>
                                    </div>
                                  </div>

                                  <div className="pt-4 border-t">
                                    <p className="text-sm text-muted-foreground">
                                      Joined on {new Date(selectedEmployee.joinDate).toLocaleDateString("en-US", {
                                        year: "numeric",
                                        month: "long",
                                        day: "numeric",
                                      })}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
