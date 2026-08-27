import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-6 animate-fade-in">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl gradient-primary shadow-soft mx-auto">
          <span className="text-4xl font-bold text-primary-foreground">D</span>
        </div>
        <div>
          <h1 className="text-6xl font-display font-bold text-foreground">404</h1>
          <p className="mt-2 text-xl text-muted-foreground">Page not found</p>
        </div>
        <Button asChild className="gradient-primary border-0">
          <Link to="/">
            <Home className="mr-2 h-4 w-4" />
            Return Home
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
