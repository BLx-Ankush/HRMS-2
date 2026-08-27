import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, LogIn } from "lucide-react";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await login(email, password);
      if (result.ok) {
        toast({
          title: "Welcome back!",
          description: "You have successfully signed in.",
        });
        navigate("/dashboard");
      } else {
        const notConfirmed = /confirm/i.test(result.error ?? "");
        toast({
          title: "Sign in failed",
          description: notConfirmed
            ? "Your email hasn't been confirmed yet. Check your inbox for the confirmation link, or ask an admin to disable email confirmation in Supabase."
            : "Invalid email or password. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 gradient-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,hsl(var(--accent)/0.3),transparent_50%)]" />
        <div className="relative z-10 flex flex-col justify-center p-12">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-foreground shadow-soft">
              <span className="text-2xl font-bold text-primary">D</span>
            </div>
            <h1 className="text-3xl font-display font-bold text-primary-foreground">Dayflow</h1>
          </div>
          <h2 className="text-4xl font-display font-bold text-primary-foreground mb-4">
            Human Resource Management System
          </h2>
          <p className="text-lg text-primary-foreground/80 max-w-md">
            Streamline your HR operations with our comprehensive platform for employee management, attendance tracking, and payroll.
          </p>
          
          <div className="mt-12 space-y-4">
            <div className="flex items-center gap-3 text-primary-foreground/90">
              <div className="h-2 w-2 rounded-full bg-primary-foreground" />
              <span>Employee onboarding & profile management</span>
            </div>
            <div className="flex items-center gap-3 text-primary-foreground/90">
              <div className="h-2 w-2 rounded-full bg-primary-foreground" />
              <span>Attendance & time tracking</span>
            </div>
            <div className="flex items-center gap-3 text-primary-foreground/90">
              <div className="h-2 w-2 rounded-full bg-primary-foreground" />
              <span>Leave management & approvals</span>
            </div>
            <div className="flex items-center gap-3 text-primary-foreground/90">
              <div className="h-2 w-2 rounded-full bg-primary-foreground" />
              <span>Payroll visibility</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Sign In Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <Card className="w-full max-w-md border-border shadow-soft animate-fade-in">
          <CardHeader className="space-y-1 text-center">
            <div className="lg:hidden flex items-center justify-center gap-2 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-primary">
                <span className="text-xl font-bold text-primary-foreground">D</span>
              </div>
              <span className="text-xl font-display font-bold text-foreground">Dayflow</span>
            </div>
            <CardTitle className="text-2xl font-display font-bold">Welcome back</CardTitle>
            <CardDescription className="text-muted-foreground">
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full h-11 gradient-primary border-0" disabled={isLoading}>
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <LogIn className="h-4 w-4" />
                    Sign In
                  </span>
                )}
              </Button>
            </form>

            <div className="mt-6 space-y-4">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Demo Accounts</span>
                </div>
              </div>
              
              <div className="grid gap-2 text-sm">
                <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                  <p className="font-medium text-foreground">Admin Account</p>
                  <p className="text-muted-foreground">admin@dayflow.com / admin123</p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                  <p className="font-medium text-foreground">Employee Account</p>
                  <p className="text-muted-foreground">employee@dayflow.com / employee123</p>
                </div>
              </div>
            </div>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link to="/signup" className="font-medium text-primary hover:underline">
                Sign up
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
