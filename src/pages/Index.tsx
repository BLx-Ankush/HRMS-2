import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Users, 
  Clock, 
  Calendar, 
  DollarSign, 
  Shield, 
  Zap,
  ArrowRight,
  Check
} from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Employee Management",
    description: "Complete employee profiles with onboarding workflows and document management.",
  },
  {
    icon: Clock,
    title: "Attendance Tracking",
    description: "Real-time check-in/out with daily and weekly views for accurate time tracking.",
  },
  {
    icon: Calendar,
    title: "Leave Management",
    description: "Streamlined leave requests with approval workflows and balance tracking.",
  },
  {
    icon: DollarSign,
    title: "Payroll Visibility",
    description: "Transparent salary breakdowns with earnings, deductions, and payment history.",
  },
  {
    icon: Shield,
    title: "Role-Based Access",
    description: "Secure access control with distinct admin and employee permissions.",
  },
  {
    icon: Zap,
    title: "Approval Workflows",
    description: "Automated workflows for leave requests and attendance management.",
  },
];

const benefits = [
  "Reduce HR administrative workload by 60%",
  "Real-time visibility into workforce metrics",
  "Secure, role-based access control",
  "Mobile-friendly design for on-the-go access",
  "Comprehensive reporting and analytics",
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-primary shadow-soft">
              <span className="text-lg font-bold text-primary-foreground">D</span>
            </div>
            <span className="text-xl font-display font-bold text-foreground">Dayflow</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#benefits" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Benefits
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link to="/signin">Sign In</Link>
            </Button>
            <Button asChild className="gradient-primary border-0 shadow-soft hover:shadow-glow transition-shadow">
              <Link to="/signup">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.1),transparent_50%)]" />
        <div className="container mx-auto px-4 py-24 md:py-32 relative">
          <div className="max-w-3xl mx-auto text-center animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Zap className="h-4 w-4" />
              Modern HR Management Platform
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-foreground mb-6 leading-tight">
              Simplify Your{" "}
              <span className="text-primary">HR Operations</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Dayflow streamlines your HR operations with comprehensive employee management, 
              attendance tracking, leave management, and payroll visibility—all in one platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild className="gradient-primary border-0 shadow-soft hover:shadow-glow transition-all h-12 px-8">
                <Link to="/signup">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-12 px-8">
                <Link to="/signin">View Demo</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Demo: admin@dayflow.com / admin123
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
              Everything You Need
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Comprehensive HR tools designed to simplify workforce management and boost productivity.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="border-border hover:shadow-soft transition-all duration-300 hover:-translate-y-1 group"
              >
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-display font-semibold text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-6">
                Why Choose Dayflow?
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Built for modern businesses that want to streamline HR operations 
                without the complexity of traditional enterprise software.
              </p>
              <ul className="space-y-4">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full gradient-primary flex items-center justify-center flex-shrink-0 mt-0.5 shadow-soft">
                      <Check className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <span className="text-foreground">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <Card className="border-border shadow-soft">
                <CardContent className="p-8">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Employees</p>
                        <p className="text-3xl font-display font-bold text-foreground">156</p>
                      </div>
                      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Users className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Present Today</p>
                        <p className="text-3xl font-display font-bold text-success">142</p>
                      </div>
                      <div className="h-12 w-12 rounded-xl bg-success/10 flex items-center justify-center">
                        <Check className="h-6 w-6 text-success" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Pending Requests</p>
                        <p className="text-3xl font-display font-bold text-warning">12</p>
                      </div>
                      <div className="h-12 w-12 rounded-xl bg-warning/10 flex items-center justify-center">
                        <Calendar className="h-6 w-6 text-warning" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 gradient-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,hsl(var(--accent)/0.3),transparent_50%)]" />
        <div className="container mx-auto px-4 text-center relative">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-primary-foreground mb-4">
            Ready to Transform Your HR?
          </h2>
          <p className="text-lg text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
            Join thousands of companies already using Dayflow to streamline their HR operations.
          </p>
          <Button size="lg" variant="secondary" asChild className="h-12 px-8 shadow-soft">
            <Link to="/signup">
              Get Started for Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 bg-card">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
                <span className="text-sm font-bold text-primary-foreground">D</span>
              </div>
              <span className="font-display font-semibold text-foreground">Dayflow</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2026 Dayflow HRMS. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
