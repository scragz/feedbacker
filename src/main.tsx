import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import App from './App.tsx';
import './index.css';
import { theme } from './theme.ts';

// Import the inputKnobs script
import './lib/inputKnobs.js';

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <MantineProvider theme={theme} defaultColorScheme="dark">
        <App />
      </MantineProvider>
    </React.StrictMode>,
  );
} else {
  console.error('Failed to find the root element');
}
