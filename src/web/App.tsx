import type { JSX } from "react";
import { Route, Switch } from "wouter";
import { MotionConfig } from "motion/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UserDTO } from "@shared/protocol";
import { useMe } from "./hooks/useMe";
import { Login, Signup } from "./pages/Auth";
import { RoomPage } from "./components/room/RoomPage";
import { HistoryPage } from "./pages/HistoryPage";
import { Toaster } from "./components/ui/Toaster";
import { LoadingIndicator } from "./components/ui/Progress";
import { useApplyTheme } from "./theme/ThemeProvider";
import { AudioLayer, useRoomSockets } from "./components/room/useRoomGlue";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <Shell />
        <Toaster />
      </MotionConfig>
    </QueryClientProvider>
  );
}

function Shell(): JSX.Element {
  const meQuery = useMe();
  const me = meQuery.data ?? null;

  if (meQuery.isPending && me === null) return <Splash />;

  if (me === null) {
    return (
      <Switch>
        <Route path="/signup" component={() => <Signup />} />
        <Route component={Login} />
      </Switch>
    );
  }
  return <AuthenticatedShell me={me} />;
}

function AuthenticatedShell({ me }: { me: UserDTO }): JSX.Element {
  useApplyTheme();
  useRoomSockets(me);

  return (
    <>
      <AudioLayer />
      <Switch>
        <Route path="/history">
          <HistoryPage me={me} />
        </Route>
        <Route path="/">
          <RoomPage me={me} />
        </Route>
        <Route>
          <RoomPage me={me} />
        </Route>
      </Switch>
    </>
  );
}

function Splash(): JSX.Element {
  return (
    <div className="grid min-h-dvh place-items-center bg-surface">
      <LoadingIndicator size={36} />
    </div>
  );
}
