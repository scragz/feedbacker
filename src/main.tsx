import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import './index.css';
import "@mantine/core/styles.css";
import '@mantine/core/styles.layer.css';
import App from './App.tsx';

const theme = createTheme({
  fontFamily: "'IBM Plex Mono', monospace",
  primaryColor: 'green',
  headings: {
    fontFamily: "Frijole, sans-serif",
    sizes: {
      h1: { fontSize: '36' },
    },
  }
});

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <MantineProvider theme={theme} defaultColorScheme="dark" forceColorScheme="dark">
        <App />
      </MantineProvider>
    </StrictMode>,
  );
} else {
  console.error("Failed to find the root element. The app will not be rendered.");
}
