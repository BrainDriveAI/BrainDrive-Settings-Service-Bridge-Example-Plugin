import './bootstrap';
import React from 'react';
import { ThemeSelector } from './components';

// Main entry point for ServiceExample_Settings plugin

// Export the ThemeSelector component for BrainDrive to load
export { ThemeSelector };

// Export the ThemeSelector as default
export default ThemeSelector;

// Version information
export const version = '1.0.0';

// Plugin metadata for development/debugging
export const metadata = {
  name: 'ServiceExample_Settings',
  description: 'Simple theme selector demo showing basic Settings Service Bridge usage',
  version: '1.0.0',
  author: 'BrainDrive Team'
};

// For development mode, render the component if we're in a standalone environment
if (typeof window !== 'undefined' && (window as any).__DEV__) {
  // Check if we're running in development mode (webpack dev server)
  const rootElement = document.getElementById('root');
  if (rootElement) {
    import('react-dom/client').then(({ createRoot }) => {
      const root = createRoot(rootElement);
      
      // Mock settings service for development
      const mockServices = {
        settings: {
          getSetting: async (key: string, context?: any) => {
            console.log('Mock getSetting:', key, context);
            // Return mock theme value
            if (key === 'theme') {
              return localStorage.getItem('mock-theme') || 'light';
            }
            return null;
          },
          setSetting: async (key: string, value: any, context?: any) => {
            console.log('Mock setSetting:', key, value, context);
            // Store mock theme value
            if (key === 'theme') {
              localStorage.setItem('mock-theme', value);
            }
            // Simulate a small delay
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      };

      // Render the plugin with mock services
      root.render(
        React.createElement(React.StrictMode, null,
          React.createElement('div', { style: { padding: '20px' } },
            React.createElement('h2', null, 'ServiceExample_Settings - Development Mode'),
            React.createElement('div', { style: { marginTop: '20px' } },
              React.createElement(ThemeSelector, { 
                services: mockServices,
                title: 'Theme Selector Demo',
                description: 'Demonstrates basic Settings Service Bridge usage'
              })
            )
          )
        )
      );
    }).catch(error => {
      console.error('Failed to load React DOM:', error);
    });
  }
}