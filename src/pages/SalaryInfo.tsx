import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Building, Users, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  useCompanyStructure,
  useUpdateCompanyStructure,
  useEmployeeSalaries,
  useUpsertEmployeeSalary,
  useEmployees,
} from "@/hooks/hrms";
import type { CompanyStructure, EmployeeSalary, SalaryComponent } from "@/types/db";

const emptyEmployeeSalary = (employeeId: string): EmployeeSalary => ({
  employeeId,
  basicSalary: 0,
  hra: 0,
  standardAllowance: 0,
  performanceBonus: 0,
  lta: 0,
  fixedAllowance: 0,
  pfEmployee: 0,
  pfEmployer: 0,
  professionalTax: 0,
});

const emptyCompanyStructure: CompanyStructure = {
  monthWage: 0,
  yearlyWage: 0,
  workingDays: 0,
  breakTime: 0,
  components: [],
  pfContribution: {
    employee: { amount: 0, percentage: "" },
    employer: { amount: 0, percentage: "" },
  },
  taxDeductions: { professionalTax: 0 },
};

export default function SalaryInfo() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [activeTab, setActiveTab] = useState("company");
  const [editedSalary, setEditedSalary] = useState<EmployeeSalary | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCompanyStructure, setEditedCompanyStructure] = useState<CompanyStructure | null>(null);
  const [isEditingCompany, setIsEditingCompany] = useState(false);

  const { data: employees = [] } = useEmployees();
  const { data: employeeSalaries = {} } = useEmployeeSalaries();
  const { data: companyStructure } = useCompanyStructure();
  const upsertSalary = useUpsertEmployeeSalary();
  const updateCompany = useUpdateCompanyStructure();

  if (!isAdmin) {
    return (
      <DashboardLayout title="Salary Structure">
        <Card className="border-border shadow-sm">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Please contact HR for salary structure information.</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const currentSalary =
    editedSalary ||
    (selectedEmployee ? employeeSalaries[selectedEmployee] : undefined) ||
    (selectedEmployee ? emptyEmployeeSalary(selectedEmployee) : emptyEmployeeSalary(""));

  return (
    <DashboardLayout title="Salary Structure">
      <div className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-9 bg-secondary/50">
            <TabsTrigger value="company" className="text-xs h-7 gap-1.5">
              <Building className="h-3.5 w-3.5" />
              Company Structure
            </TabsTrigger>
            <TabsTrigger value="employee" className="text-xs h-7 gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Employee Salary
            </TabsTrigger>
          </TabsList>

          {/* Company Structure Tab */}
          <TabsContent value="company" className="mt-4">
            <CompanyStructureEditor
              structure={editedCompanyStructure || companyStructure || emptyCompanyStructure}
              isEditing={isEditingCompany}
              onEdit={() => {
                setEditedCompanyStructure(companyStructure || emptyCompanyStructure);
                setIsEditingCompany(true);
              }}
              onCancel={() => {
                setEditedCompanyStructure(null);
                setIsEditingCompany(false);
              }}
              onSave={() => {
                if (editedCompanyStructure) {
                  updateCompany.mutate(editedCompanyStructure, {
                    onSuccess: () => {
                      setIsEditingCompany(false);
                      setEditedCompanyStructure(null);
                      toast.success("Company structure updated successfully");
                    },
                    onError: () => toast.error("Could not update company structure"),
                  });
                }
              }}
              onChange={(updates) => {
                setEditedCompanyStructure(prev => prev ? { ...prev, ...updates } : null);
              }}
              onComponentChange={(index, field, value) => {
                setEditedCompanyStructure(prev => {
                  if (!prev) return null;
                  const newComponents = [...prev.components];
                  newComponents[index] = { ...newComponents[index], [field]: value };
                  return { ...prev, components: newComponents };
                });
              }}
              onPfChange={(type, field, value) => {
                setEditedCompanyStructure(prev => {
                  if (!prev) return null;
                  return {
                    ...prev,
                    pfContribution: {
                      ...prev.pfContribution,
                      [type]: { ...prev.pfContribution[type], [field]: value }
                    }
                  };
                });
              }}
            />
          </TabsContent>

          {/* Employee Salary Tab */}
          <TabsContent value="employee" className="mt-4 space-y-6">
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-display">Employee Salary Structure</CardTitle>
                    <CardDescription className="text-xs">Select an employee to configure their salary</CardDescription>
                  </div>
                  <Select value={selectedEmployee} onValueChange={(v) => { setSelectedEmployee(v); setEditedSalary(null); setIsEditing(false); }}>
                    <SelectTrigger className="w-[180px] h-8 text-sm">
                      <SelectValue placeholder="Select an employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {!selectedEmployee ? (
                  <div className="text-center py-12">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-sm font-medium text-foreground">No Employee Selected</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Select an employee from the dropdown above to configure their salary structure.
                    </p>
                  </div>
                ) : (
                  <EmployeeSalaryEditor
                    employeeName={employees.find(e => e.id === selectedEmployee)?.name || ""}
                    salary={currentSalary}
                    isEditing={isEditing}
                    onEdit={() => {
                      setEditedSalary(employeeSalaries[selectedEmployee] || emptyEmployeeSalary(selectedEmployee));
                      setIsEditing(true);
                    }}
                    onCancel={() => {
                      setEditedSalary(null);
                      setIsEditing(false);
                    }}
                    onSave={() => {
                      if (editedSalary) {
                        upsertSalary.mutate(
                          { ...editedSalary, employeeId: selectedEmployee },
                          {
                            onSuccess: () => {
                              setIsEditing(false);
                              setEditedSalary(null);
                              toast.success("Salary structure updated successfully");
                            },
                            onError: () => toast.error("Could not update salary structure"),
                          }
                        );
                      }
                    }}
                    onChange={(field, value) => {
                      setEditedSalary(prev => prev ? { ...prev, [field]: value } : null);
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// Employee Salary Editor Component
interface EmployeeSalaryEditorProps {
  employeeName: string;
  salary: EmployeeSalary;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onChange: (field: keyof EmployeeSalary, value: number) => void;
}

function EmployeeSalaryEditor({
  employeeName,
  salary,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  onChange
}: EmployeeSalaryEditorProps) {
  const grossSalary = salary.basicSalary + salary.hra + salary.standardAllowance + 
                      salary.performanceBonus + salary.lta + salary.fixedAllowance;
  const totalDeductions = salary.pfEmployee + salary.professionalTax;
  const netSalary = grossSalary - totalDeductions;

  const salaryFields: { key: keyof EmployeeSalary; label: string; description: string }[] = [
    { key: "basicSalary", label: "Basic Salary", description: "Base salary component" },
    { key: "hra", label: "House Rent Allowance", description: "50% of basic salary" },
    { key: "standardAllowance", label: "Standard Allowance", description: "Fixed monthly allowance" },
    { key: "performanceBonus", label: "Performance Bonus", description: "Performance-based incentive" },
    { key: "lta", label: "Leave Travel Allowance", description: "Travel expense allowance" },
    { key: "fixedAllowance", label: "Fixed Allowance", description: "Additional fixed component" },
  ];

  const deductionFields: { key: keyof EmployeeSalary; label: string; description: string }[] = [
    { key: "pfEmployee", label: "PF (Employee)", description: "Employee's PF contribution" },
    { key: "pfEmployer", label: "PF (Employer)", description: "Employer's PF contribution" },
    { key: "professionalTax", label: "Professional Tax", description: "Monthly professional tax" },
  ];

  return (
    <div className="space-y-6">
      {/* Header with employee name and action buttons */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Configuring salary for: <span className="font-semibold text-foreground">{employeeName}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={onCancel}>
                <RotateCcw className="h-3 w-3" />
                Cancel
              </Button>
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={onSave}>
                <Save className="h-3 w-3" />
                Save Changes
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={onEdit}>
              <Pencil className="h-3 w-3" />
              Edit Salary
            </Button>
          )}
        </div>
      </div>

      {/* Salary Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-secondary/30 border border-border">
          <p className="text-xs text-muted-foreground">Gross Salary</p>
          <p className="text-xl font-bold text-foreground">₹{grossSalary.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">per month</p>
        </div>
        <div className="p-4 rounded-lg bg-secondary/30 border border-border">
          <p className="text-xs text-muted-foreground">Total Deductions</p>
          <p className="text-xl font-bold text-destructive">-₹{totalDeductions.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">per month</p>
        </div>
        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-xs text-muted-foreground">Net Salary</p>
          <p className="text-xl font-bold text-primary">₹{netSalary.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">per month</p>
        </div>
      </div>

      {/* Earnings Section */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground border-b border-border pb-2">Earnings</h4>
        <div className="grid md:grid-cols-2 gap-4">
          {salaryFields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={field.key} className="text-xs font-medium">
                {field.label}
              </Label>
              {isEditing ? (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                  <Input
                    id={field.key}
                    type="number"
                    value={salary[field.key]}
                    onChange={(e) => onChange(field.key, parseFloat(e.target.value) || 0)}
                    className="pl-7 h-9 text-sm"
                  />
                </div>
              ) : (
                <div className="h-9 px-3 py-2 rounded-md bg-secondary/30 border border-border text-sm font-medium">
                  ₹{salary[field.key].toLocaleString()}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">{field.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Deductions Section */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground border-b border-border pb-2">Deductions</h4>
        <div className="grid md:grid-cols-3 gap-4">
          {deductionFields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={field.key} className="text-xs font-medium">
                {field.label}
              </Label>
              {isEditing ? (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                  <Input
                    id={field.key}
                    type="number"
                    value={salary[field.key]}
                    onChange={(e) => onChange(field.key, parseFloat(e.target.value) || 0)}
                    className="pl-7 h-9 text-sm"
                  />
                </div>
              ) : (
                <div className="h-9 px-3 py-2 rounded-md bg-secondary/30 border border-border text-sm font-medium">
                  ₹{salary[field.key].toLocaleString()}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">{field.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Company Structure Editor Component
interface CompanyStructureEditorProps {
  structure: CompanyStructure;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onChange: (updates: Partial<CompanyStructure>) => void;
  onComponentChange: (index: number, field: keyof SalaryComponent, value: string | number) => void;
  onPfChange: (type: 'employee' | 'employer', field: 'amount' | 'percentage', value: number | string) => void;
}

function CompanyStructureEditor({
  structure,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  onChange,
  onComponentChange,
  onPfChange
}: CompanyStructureEditorProps) {
  const totalEarnings = structure.components.reduce((sum, c) => sum + c.amount, 0);
  const totalDeductions = structure.pfContribution.employee.amount + structure.taxDeductions.professionalTax;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="border-border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="text-base font-display">Company Salary Structure</CardTitle>
            <CardDescription className="text-xs">Configure the default salary structure for all employees</CardDescription>
          </div>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={onCancel}>
                  <RotateCcw className="h-3 w-3" />
                  Cancel
                </Button>
                <Button size="sm" className="h-8 text-xs gap-1.5" onClick={onSave}>
                  <Save className="h-3 w-3" />
                  Save Structure
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={onEdit}>
                <Pencil className="h-3 w-3" />
                Edit Structure
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Monthly Wage</p>
            {isEditing ? (
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                <Input
                  type="number"
                  value={structure.monthWage}
                  onChange={(e) => onChange({ monthWage: parseFloat(e.target.value) || 0 })}
                  className="pl-6 h-8 text-sm font-semibold"
                />
              </div>
            ) : (
              <p className="text-lg font-bold">₹{structure.monthWage.toLocaleString()}</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Yearly Wage</p>
            {isEditing ? (
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                <Input
                  type="number"
                  value={structure.yearlyWage}
                  onChange={(e) => onChange({ yearlyWage: parseFloat(e.target.value) || 0 })}
                  className="pl-6 h-8 text-sm font-semibold"
                />
              </div>
            ) : (
              <p className="text-lg font-bold">₹{structure.yearlyWage.toLocaleString()}</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Working Days/Week</p>
            {isEditing ? (
              <Input
                type="number"
                value={structure.workingDays}
                onChange={(e) => onChange({ workingDays: parseInt(e.target.value) || 0 })}
                className="h-8 text-sm font-semibold"
              />
            ) : (
              <p className="text-lg font-bold">{structure.workingDays} days</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Break Time</p>
            {isEditing ? (
              <Input
                type="number"
                value={structure.breakTime}
                onChange={(e) => onChange({ breakTime: parseFloat(e.target.value) || 0 })}
                className="h-8 text-sm font-semibold"
              />
            ) : (
              <p className="text-lg font-bold">{structure.breakTime} hr</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Salary Components */}
        <Card className="border-border shadow-sm lg:col-span-2">
          <CardHeader className="py-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Salary Components</CardTitle>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Earnings</p>
                <p className="text-sm font-bold text-primary">₹{totalEarnings.toLocaleString()}/month</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {structure.components.map((component, index) => (
                <div key={index} className="flex items-center gap-4 p-3 rounded-lg bg-secondary/20 border border-border/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{component.name}</p>
                    <p className="text-[10px] text-muted-foreground">{component.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {isEditing ? (
                      <>
                        <div className="relative w-28">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                          <Input
                            type="number"
                            value={component.amount}
                            onChange={(e) => onComponentChange(index, 'amount', parseFloat(e.target.value) || 0)}
                            className="pl-5 h-8 text-xs"
                          />
                        </div>
                        {component.percentage && (
                          <Input
                            type="text"
                            value={component.percentage}
                            onChange={(e) => onComponentChange(index, 'percentage', e.target.value)}
                            className="w-16 h-8 text-xs text-center"
                            placeholder="%"
                          />
                        )}
                      </>
                    ) : (
                      <div className="text-right">
                        <p className="text-sm font-semibold">₹{component.amount.toLocaleString()}</p>
                        {component.percentage && (
                          <p className="text-[10px] text-muted-foreground">{component.percentage}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Deductions Column */}
        <div className="space-y-6">
          {/* PF Contribution */}
          <Card className="border-border shadow-sm">
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-semibold">PF Contribution</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="p-3 rounded-lg bg-secondary/20 border border-border/50">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium">Employee</p>
                  {isEditing ? (
                    <div className="relative w-24">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                      <Input
                        type="number"
                        value={structure.pfContribution.employee.amount}
                        onChange={(e) => onPfChange('employee', 'amount', parseFloat(e.target.value) || 0)}
                        className="pl-5 h-7 text-xs"
                      />
                    </div>
                  ) : (
                    <p className="text-sm font-semibold">₹{structure.pfContribution.employee.amount.toLocaleString()}</p>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">{structure.pfContribution.employee.percentage} of basic</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/20 border border-border/50">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium">Employer</p>
                  {isEditing ? (
                    <div className="relative w-24">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                      <Input
                        type="number"
                        value={structure.pfContribution.employer.amount}
                        onChange={(e) => onPfChange('employer', 'amount', parseFloat(e.target.value) || 0)}
                        className="pl-5 h-7 text-xs"
                      />
                    </div>
                  ) : (
                    <p className="text-sm font-semibold">₹{structure.pfContribution.employer.amount.toLocaleString()}</p>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">{structure.pfContribution.employer.percentage} of basic</p>
              </div>
            </CardContent>
          </Card>

          {/* Tax Deductions */}
          <Card className="border-border shadow-sm">
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-semibold">Tax Deductions</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="p-3 rounded-lg bg-secondary/20 border border-border/50">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium">Professional Tax</p>
                  {isEditing ? (
                    <div className="relative w-24">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                      <Input
                        type="number"
                        value={structure.taxDeductions.professionalTax}
                        onChange={(e) => onChange({ taxDeductions: { professionalTax: parseFloat(e.target.value) || 0 } })}
                        className="pl-5 h-7 text-xs"
                      />
                    </div>
                  ) : (
                    <p className="text-sm font-semibold">₹{structure.taxDeductions.professionalTax}</p>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">Monthly deduction</p>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="border-primary/20 bg-primary/5 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Deductions</p>
              <p className="text-lg font-bold text-destructive">-₹{totalDeductions.toLocaleString()}/month</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
