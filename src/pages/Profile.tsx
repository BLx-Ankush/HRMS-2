import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Save, X, FileText, Lock, Upload } from "lucide-react";

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    phone: user?.phone || "",
    address: user?.address || "",
  });
  const [about, setAbout] = useState(user?.about || "");
  const [skillsInput, setSkillsInput] = useState((user?.skills ?? []).join(", "));
  const [activeTab, setActiveTab] = useState("resume");

  const skills = user?.skills ?? [];

  // Keep local edit state in sync once the profile loads from Supabase.
  useEffect(() => {
    setFormData({ phone: user?.phone || "", address: user?.address || "" });
    setAbout(user?.about || "");
    setSkillsInput((user?.skills ?? []).join(", "));
  }, [user?.phone, user?.address, user?.about, user?.skills]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const parsedSkills = skillsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await updateProfile({ phone: formData.phone, address: formData.address, about, skills: parsedSkills });
      setIsEditing(false);
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    } catch {
      toast({
        title: "Update failed",
        description: "Could not save your changes. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      phone: user?.phone || "",
      address: user?.address || "",
    });
    setAbout(user?.about || "");
    setSkillsInput((user?.skills ?? []).join(", "));
    setIsEditing(false);
  };

  return (
    <DashboardLayout title="My Profile">
      <div className="space-y-6">
        {/* Profile Header Card */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Left Section - Avatar and Basic Info */}
              <div className="flex gap-4">
                <Avatar className="h-20 w-20 border-2 border-[hsl(var(--card-accent))]">
                  <AvatarFallback className="bg-[hsl(var(--card-accent))] text-foreground text-xl font-semibold">
                    {user?.name ? getInitials(user.name) : "X"}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <h2 className="text-lg font-display font-bold text-foreground">{user?.name || "—"}</h2>
                  <div className="space-y-0.5 text-xs">
                    <p className="text-muted-foreground">
                      <span className="text-muted-foreground/70">Login ID</span>
                      <br />
                      <span className="text-foreground font-medium">{user?.employeeId || "—"}</span>
                    </p>
                    <p className="text-muted-foreground">
                      <span className="text-muted-foreground/70">Email</span>
                      <br />
                      <span className="text-foreground font-medium">{user?.email || "—"}</span>
                    </p>
                    <p className="text-muted-foreground">
                      <span className="text-muted-foreground/70">Mobile</span>
                      <br />
                      <span className="text-foreground font-medium">{formData.phone}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Section - Company Info */}
              <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                <div>
                  <p className="text-muted-foreground/70">Company</p>
                  <p className="text-foreground font-medium">Dayflow Inc.</p>
                </div>
                <div>
                  <p className="text-muted-foreground/70">Department</p>
                  <p className="text-foreground font-medium">{user?.department || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground/70">Manager</p>
                  <p className="text-foreground font-medium">CEO</p>
                </div>
                <div>
                  <p className="text-muted-foreground/70">Location</p>
                  <p className="text-foreground font-medium">{formData.address}</p>
                </div>
              </div>

              {/* Edit Button */}
              <div className="absolute top-4 right-4 lg:static lg:self-start">
                {isEditing ? (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleCancel} className="h-8 text-xs gap-1">
                      <X className="h-3 w-3" />
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} className="h-8 text-xs gap-1">
                      <Save className="h-3 w-3" />
                      Save
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} className="h-8 text-xs gap-1 text-muted-foreground">
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                )}
              </div>
            </div>

            {/* Resume / Private Info Tabs */}
            <div className="mt-6 pt-4 border-t border-border">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="h-9 bg-transparent p-0 gap-2">
                  <TabsTrigger 
                    value="resume" 
                    className="h-8 px-4 text-xs border border-border data-[state=active]:bg-secondary data-[state=active]:border-foreground/20 rounded-md gap-1.5"
                  >
                    <FileText className="h-3 w-3" />
                    Resume
                  </TabsTrigger>
                  <TabsTrigger 
                    value="private" 
                    className="h-8 px-4 text-xs border border-border data-[state=active]:bg-secondary data-[state=active]:border-foreground/20 rounded-md gap-1.5"
                  >
                    <Lock className="h-3 w-3" />
                    Private Info
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="resume" className="mt-4">
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Resume uploads require a Supabase Storage bucket, which isn't configured in this build yet.
                    </p>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" disabled>
                      <Upload className="h-3 w-3" />
                      Upload Resume
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="private" className="mt-4">
                  <p className="text-xs text-muted-foreground">Your private information is securely stored and only visible to authorized personnel.</p>
                </TabsContent>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        {/* About and Skills Grid */}
        <div className="grid gap-6 lg:grid-cols-5">
          {/* About Section */}
          <Card className="border-border shadow-sm lg:col-span-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-display">About</CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <Textarea
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  className="text-sm min-h-[80px]"
                />
              ) : (
                <p className="text-sm text-muted-foreground leading-relaxed">{about}</p>
              )}
            </CardContent>
          </Card>

          {/* Skills Section */}
          <Card className="border-border shadow-sm lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-display">Skills</CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-2">
                  <Input
                    value={skillsInput}
                    onChange={(e) => setSkillsInput(e.target.value)}
                    placeholder="e.g. React, TypeScript, SQL"
                    className="text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">Separate skills with commas.</p>
                </div>
              ) : skills.length === 0 ? (
                <p className="text-sm text-muted-foreground">No skills added yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {skills.map((skill) => (
                    <Badge
                      key={skill}
                      variant="secondary"
                      className="text-xs py-1 px-2.5 bg-[hsl(var(--card-accent))] hover:bg-[hsl(var(--card-accent))] text-foreground"
                    >
                      {skill}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
