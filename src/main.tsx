import React from 'react';
import { createRoot } from 'react-dom/client';
import { createGlobalStyle } from 'styled-components';
import { DEFAULT_THEME, ThemeProvider } from '@zendeskgarden/react-theming';
import { App } from './App';

const GlobalStyle = createGlobalStyle`
  html,
  body,
  button,
  input,
  select,
  textarea {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", Arial, sans-serif;
  }

  body {
    margin: 0;
    padding: 0;
    color: ${(p) => p.theme.palette.grey[800]};
    background: ${(p) => p.theme.palette.white};
    -webkit-font-smoothing: antialiased;
  }
`;

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <ThemeProvider theme={DEFAULT_THEME}>
        <GlobalStyle />
        <App />
      </ThemeProvider>
    </React.StrictMode>
  );
}
