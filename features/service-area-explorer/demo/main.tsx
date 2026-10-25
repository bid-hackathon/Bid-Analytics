// Standalone entry for viewing the harness before the app shell exists.
// Build: see "Demo" in ../README.md.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ServiceAreaExplorerDemo } from './ServiceAreaExplorerDemo';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ServiceAreaExplorerDemo />
  </StrictMode>,
);
