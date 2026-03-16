import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import Master from "./pages/Master";
import FullSchedule from "./pages/FullSchedule";
import Statistics from "./pages/Statistics";
import PayCalculator from "./pages/PayCalculator";
import ActivityLog from "./pages/ActivityLog";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/settings"} component={Settings} />
      <Route path={"/master"} component={Master} />
      <Route path={"/full-schedule"} component={FullSchedule} />
      <Route path={"/statistics"} component={Statistics} />
      <Route path={"/pay-calculator"} component={PayCalculator} />
      <Route path={"/activity-log"} component={ActivityLog} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster richColors position="top-center" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
