import { AppStateProvider } from './state/AppState';
import { ApplicationShell } from './components/ApplicationShell';

export function App() {
  return (
    <AppStateProvider>
      <ApplicationShell />
    </AppStateProvider>
  );
}
