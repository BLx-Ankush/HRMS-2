import { useState } from "react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTimeOffRequests, useSubmitTimeOff, useDecideTimeOff } from "@/hooks/hrms";

const TYPES = ["Paid Time Off", "Sick Leave", "Unpaid Leave"];

const typeColors: Record<string, string> = {
  "Paid Time Off": "text-success",
  "Sick Leave": "text-destructive",
  "Unpaid Leave": "text-muted-foreground",
};

const statusConfig: Record<string, { label: string; className: string }> = {
  approved: { label: "Approved", className: "bg-success/10 text-success border-success/20" },
  pending: { label: "Pending", className: "bg-warning/10 text-warning border-warning/20" },
  rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

const formatDMY = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : format(d, "dd/MM/yyyy");
};

const emptyForm = { type: "", startDate: "", endDate: "" };

export default function TimeOff() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const { data: requests = [] } = useTimeOffRequests();
  const submitTimeOff = useSubmitTimeOff();
  const decideTimeOff = useDecideTimeOff();

  const handleSubmit = () => {
    if (!form.type || !form.startDate || !form.endDate) {
      toast({ title: "Missing fields", description: "Type, start and end dates are required.", variant: "destructive" });
      return;
    }
    if (!user) return;
    submitTimeOff.mutate(
      {
        profileId: user.id, employeeId: user.employeeId, employeeName: user.name,
        type: form.type, startDate: form.startDate, endDate: form.endDate,
      },
      {
        onSuccess: () => {
          setForm(emptyForm);
          setOpen(false);
          toast({ title: "Request submitted", description: "Your time off request is pending approval." });
        },
        onError: () => toast({ title: "Submission failed", description: "Please try again.", variant: "destructive" }),
      }
    );
  };

  const decide = (id: string, status: "approved" | "rejected") => {
    decideTimeOff.mutate(
      { id, status },
      {
        onSuccess: () => toast({ title: `Request ${status}`, description: `The time off request was ${status}.` }),
        onError: () => toast({ title: "Action failed", description: "Please try again.", variant: "destructive" }),
      }
    );
  };

  const requestDialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Request Time Off
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Request Time Off</DialogTitle>
          <DialogDescription>Submit a new time off request for approval.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="to-start">Start date</Label>
              <Input id="to-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to-end">End date</Label>
              <Input id="to-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitTimeOff.isPending}>
            {submitTimeOff.isPending ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ---------- Employee view ----------
  if (!isAdmin) {
    const mine = requests.filter((r) => r.employeeId === user?.employeeId);
    return (
      <DashboardLayout title="Time Off">
        <div className="space-y-6">
          <Card className="border-border shadow-sm">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-display font-semibold text-foreground">My Time Off Requests</h3>
                {requestDialog}
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/30">
                      <TableHead className="text-xs font-medium">Type</TableHead>
                      <TableHead className="text-xs font-medium">Start Date</TableHead>
                      <TableHead className="text-xs font-medium">End Date</TableHead>
                      <TableHead className="text-xs font-medium">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mine.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                          No time off requests yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      mine.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className={`text-sm ${typeColors[request.type] || ""}`}>{request.type}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDMY(request.startDate)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDMY(request.endDate)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${statusConfig[request.status]?.className ?? ""}`}>
                              {statusConfig[request.status]?.label ?? request.status}
                            </Badge>
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

  // ---------- Admin view ----------
  const filteredRequests = requests.filter(
    (req) => req.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout title="Time Off">
      <div className="space-y-6">
        <Card className="border-border shadow-sm">
          <CardContent className="pt-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employee..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm max-w-md"
              />
            </div>

            <div>
              <h3 className="text-base font-display font-semibold text-foreground">
                Employee Time Off Requests
              </h3>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/30">
                    <TableHead className="text-xs font-medium">Name</TableHead>
                    <TableHead className="text-xs font-medium">Start Date</TableHead>
                    <TableHead className="text-xs font-medium">End Date</TableHead>
                    <TableHead className="text-xs font-medium">Time off Type</TableHead>
                    <TableHead className="text-xs font-medium">Status</TableHead>
                    <TableHead className="text-xs font-medium text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                        No time off requests found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="text-sm font-medium">{request.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDMY(request.startDate)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDMY(request.endDate)}</TableCell>
                        <TableCell className={`text-sm ${typeColors[request.type] || ""}`}>
                          {request.type}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${statusConfig[request.status]?.className ?? ""}`}>
                            {statusConfig[request.status]?.label ?? request.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {request.status === "pending" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-success border-success/30 hover:bg-success/10"
                                disabled={decideTimeOff.isPending}
                                onClick={() => decide(request.id, "approved")}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                                disabled={decideTimeOff.isPending}
                                onClick={() => decide(request.id, "rejected")}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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
