import React, { Component } from 'react';
import '../styles/theme-settings.css';

interface ThemeSelectorProps {
  services: {
    settings: {
      getSetting: (key: string, context?: any) => Promise<any>;
      setSetting: (key: string, value: any, context?: any) => Promise<void>;
    };
  };
  title?: string;
  description?: string;
}

interface ThemeSelectorState {
  currentTheme: string;
  loading: boolean;
  error: string | null;
  lastAction: string | null;
  retryCount: number;
  serviceStatus: 'available' | 'unavailable' | 'checking';
}

export class ThemeSelector extends Component<ThemeSelectorProps, ThemeSelectorState> {
  constructor(props: ThemeSelectorProps) {
    super(props);
    this.state = {
      currentTheme: 'light', // Will be updated immediately in componentDidMount
      loading: true,
      error: null,
      lastAction: null,
      retryCount: 0,
      serviceStatus: 'checking'
    };
  }

  async componentDidMount() {
    await this.validateServices();
    await this.loadCurrentTheme();
  }

  /**
   * BEST PRACTICE: Service Validation
   * Always validate that required services are available before using them
   */
  private async validateServices(): Promise<void> {
    try {
      this.setState({ serviceStatus: 'checking' });
      
      // Check if settings service is available
      if (!this.props.services?.settings) {
        throw new Error('Settings service is not available');
      }
      
      // Check if required methods exist
      if (typeof this.props.services.settings.getSetting !== 'function') {
        throw new Error('Settings service getSetting method is not available');
      }
      
      if (typeof this.props.services.settings.setSetting !== 'function') {
        throw new Error('Settings service setSetting method is not available');
      }
      
      this.setState({
        serviceStatus: 'available',
        lastAction: 'Services validated successfully'
      });
      
      console.log('ServiceExample_Settings: Service validation passed');
    } catch (error) {
      console.error('ServiceExample_Settings: Service validation failed:', error);
      this.setState({
        serviceStatus: 'unavailable',
        error: `Service validation failed: ${error.message}`,
        lastAction: 'Service validation failed'
      });
      throw error;
    }
  }

  /**
   * BEST PRACTICE: Error Categorization
   * Categorize errors to provide appropriate handling and user feedback
   */
  private categorizeError(error: any): { type: string; message: string; isRetryable: boolean } {
    const errorMessage = error?.message || 'Unknown error';
    
    // Network/Connection errors (retryable)
    if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('timeout')) {
      return {
        type: 'network',
        message: 'Network connection issue. Please check your connection.',
        isRetryable: true
      };
    }
    
    // Service unavailable errors (retryable)
    if (errorMessage.includes('service') || errorMessage.includes('unavailable')) {
      return {
        type: 'service',
        message: 'Settings service is temporarily unavailable.',
        isRetryable: true
      };
    }
    
    // Permission/Authentication errors (not retryable)
    if (errorMessage.includes('unauthorized') || errorMessage.includes('forbidden') || errorMessage.includes('permission')) {
      return {
        type: 'permission',
        message: 'You do not have permission to access settings.',
        isRetryable: false
      };
    }
    
    // Validation errors (not retryable)
    if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      return {
        type: 'validation',
        message: 'Invalid settings data provided.',
        isRetryable: false
      };
    }
    
    // Generic errors (potentially retryable)
    return {
      type: 'generic',
      message: `Settings operation failed: ${errorMessage}`,
      isRetryable: true
    };
  }

  /**
   * BEST PRACTICE: Retry Logic with Exponential Backoff
   * Implement retry logic for transient failures
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.log(`ServiceExample_Settings: Retrying ${operationName} (attempt ${attempt}/${maxRetries}) after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const result = await operation();
        
        // Reset retry count on success
        if (attempt > 0) {
          this.setState({ retryCount: 0 });
          console.log(`ServiceExample_Settings: ${operationName} succeeded after ${attempt} retries`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        const categorizedError = this.categorizeError(error);
        
        console.error(`ServiceExample_Settings: ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error);
        
        // Don't retry if error is not retryable
        if (!categorizedError.isRetryable) {
          console.log(`ServiceExample_Settings: Error is not retryable, stopping attempts`);
          break;
        }
        
        // Don't retry on last attempt
        if (attempt === maxRetries) {
          console.log(`ServiceExample_Settings: Max retries reached for ${operationName}`);
          break;
        }
        
        this.setState({ retryCount: attempt + 1 });
      }
    }
    
    throw lastError;
  }

  /**
   * BEST PRACTICE: Graceful Degradation with Retry Logic
   * Load theme settings with comprehensive error handling and fallback
   */
  private async loadCurrentTheme() {
    // Skip if services are not available
    if (this.state.serviceStatus === 'unavailable') {
      console.warn('ServiceExample_Settings: Skipping theme load - services unavailable');
      this.setState({
        currentTheme: 'light',
        loading: false,
        error: 'Settings service unavailable - using default theme',
        lastAction: 'Used fallback theme (service unavailable)'
      });
      return;
    }

    try {
      this.setState({ loading: true, error: null });
      
      // Use retry logic for loading theme settings
      const themeSettings = await this.retryOperation(
        async () => {
          console.log('ServiceExample_Settings: Getting theme_settings with userId: current');
          return await this.props.services.settings.getSetting('theme_settings', { userId: 'current' });
        },
        'loadCurrentTheme'
      );
      
      // Validate the loaded settings structure
      if (themeSettings && typeof themeSettings === 'object') {
        const theme = themeSettings.theme;
        
        // Validate theme value
        if (theme && (theme === 'light' || theme === 'dark')) {
          this.setState({
            currentTheme: theme,
            loading: false,
            lastAction: `Loaded theme: ${theme} (from Settings Service Bridge)`,
            error: null
          }, () => {
            // Force a re-render to apply the theme class immediately
            this.forceUpdate();
          });
          
          console.log('ServiceExample_Settings: Successfully loaded theme settings:', themeSettings);
          console.log('ServiceExample_Settings: Applied theme:', theme);
        } else {
          // Invalid theme value - use default
          console.warn('ServiceExample_Settings: Invalid theme value in settings:', theme);
          this.setState({
            currentTheme: 'light',
            loading: false,
            lastAction: 'Used default theme (invalid value in settings)',
            error: 'Invalid theme value in settings - using default'
          });
        }
      } else {
        // No settings found - use default
        console.info('ServiceExample_Settings: No theme settings found, using default');
        this.setState({
          currentTheme: 'light',
          loading: false,
          lastAction: 'Used default theme (no settings found)',
          error: null
        });
      }
    } catch (error) {
      console.error('ServiceExample_Settings: Error loading theme after retries:', error);
      
      const categorizedError = this.categorizeError(error);
      
      // Always provide a working fallback
      this.setState({
        currentTheme: 'light',
        error: categorizedError.message,
        loading: false,
        lastAction: 'Used fallback theme (load failed after retries)'
      });
    }
  }

  /**
   * BEST PRACTICE: Transactional Operations with Rollback
   * Set theme with validation, retry logic, and rollback on failure
   */
  private async setTheme(newTheme: string) {
    // Skip if services are not available
    if (this.state.serviceStatus === 'unavailable') {
      console.warn('ServiceExample_Settings: Cannot set theme - services unavailable');
      this.setState({
        error: 'Cannot change theme - Settings service unavailable',
        lastAction: 'Theme change blocked (service unavailable)'
      });
      return;
    }

    // Validate theme value
    if (!newTheme || (newTheme !== 'light' && newTheme !== 'dark')) {
      console.error('ServiceExample_Settings: Invalid theme value:', newTheme);
      this.setState({
        error: 'Invalid theme value provided',
        lastAction: 'Theme change blocked (invalid value)'
      });
      return;
    }

    // Store current theme for rollback
    const previousTheme = this.state.currentTheme;
    
    try {
      this.setState({ loading: true, error: null });
      
      // Step 1: Get current settings with retry logic
      let currentSettings;
      try {
        currentSettings = await this.retryOperation(
          async () => {
            console.log('ServiceExample_Settings: Getting current theme_settings for update');
            return await this.props.services.settings.getSetting('theme_settings', { userId: 'current' });
          },
          'getCurrentSettings'
        );
      } catch (error) {
        console.warn('ServiceExample_Settings: Could not load current settings, using defaults:', error);
        // Continue with default structure if settings don't exist
        currentSettings = null;
      }
      
      // Step 2: Validate and prepare updated settings
      const updatedSettings = {
        theme: newTheme,
        useSystemTheme: currentSettings?.useSystemTheme ?? false
      };
      
      // Validate the settings structure
      if (typeof updatedSettings.theme !== 'string' || typeof updatedSettings.useSystemTheme !== 'boolean') {
        throw new Error('Invalid settings structure prepared');
      }
      
      console.log('ServiceExample_Settings: Prepared settings update:', updatedSettings);
      
      // Step 3: Apply theme immediately for responsive UI (optimistic update)
      this.setState({ currentTheme: newTheme });
      
      // Step 4: Save to backend with retry logic
      await this.retryOperation(
        async () => {
          console.log('ServiceExample_Settings: Saving theme_settings with userId: current');
          await this.props.services.settings.setSetting('theme_settings', updatedSettings, { userId: 'current' });
        },
        'saveThemeSettings'
      );
      
      // Step 5: Success - update state
      this.setState({
        loading: false,
        lastAction: `Successfully set theme to: ${newTheme} (via Settings Service Bridge)`,
        error: null
      });
      
      console.log('ServiceExample_Settings: Theme successfully updated:', updatedSettings);
      
    } catch (error) {
      console.error('ServiceExample_Settings: Error setting theme after retries:', error);
      
      const categorizedError = this.categorizeError(error);
      
      // Rollback to previous theme on failure
      this.setState({
        currentTheme: previousTheme,
        error: categorizedError.message,
        loading: false,
        lastAction: `Theme change failed - rolled back to: ${previousTheme}`
      });
      
      console.log('ServiceExample_Settings: Rolled back to previous theme:', previousTheme);
    }
  }

  render() {
    const { title = "Settings Demo", description = "Demonstrates comprehensive Settings Service Bridge usage with error handling" } = this.props;
    const { currentTheme, loading, error, lastAction, retryCount, serviceStatus } = this.state;

    return (
      <div className={`${currentTheme === 'dark' ? 'dark-theme' : ''}`} style={{ padding: '16px', maxWidth: '400px' }}>
        <div className="theme-paper" style={{ padding: '16px' }}>
          {/* Header */}
          <div className="theme-flex theme-flex-between" style={{ marginBottom: '12px' }}>
            <h3 className="theme-subtitle" style={{ margin: 0, fontSize: '16px' }}>
              ⚙️ {title}
            </h3>
            <div className="theme-flex theme-flex-center theme-flex-gap-sm">
              <span style={{ fontSize: '20px' }}>
                {currentTheme === 'light' ? '☀️' : '🌙'}
              </span>
            </div>
          </div>

          <p className="theme-text-muted" style={{ marginBottom: '16px' }}>{description}</p>
          
          {/* Error Display */}
          {error && (
            <div className="theme-status theme-status-error" style={{
              marginBottom: '16px',
              padding: '8px',
              fontSize: '12px',
              display: 'block'
            }}>
              <strong>Error:</strong> {error}
            </div>
          )}
          
          {/* Current Theme Display */}
          <div className="theme-paper" style={{
            textAlign: 'center',
            marginBottom: '16px',
            padding: '12px',
            border: `2px solid ${currentTheme === 'dark' ? 'var(--status-info-color)' : 'var(--status-success-color)'}`
          }}>
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontSize: '24px', marginRight: '8px' }}>
                {currentTheme === 'light' ? '☀️' : '🌙'}
              </span>
              <span style={{
                fontSize: '18px',
                fontWeight: 'bold',
                color: currentTheme === 'dark' ? 'var(--status-info-color)' : 'var(--status-success-color)'
              }}>
                {loading ? 'Loading...' : `${currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1)} Theme`}
              </span>
            </div>
            <div className="theme-text-muted" style={{ fontSize: '10px' }}>
              📚 Current theme from Settings Service Bridge
            </div>
          </div>
          
          {/* Theme Buttons */}
          <div className="theme-flex theme-flex-gap-sm" style={{ marginBottom: '16px' }}>
            <button
              onClick={() => this.setTheme('light')}
              disabled={loading || currentTheme === 'light'}
              className={`theme-button ${currentTheme === 'light' ? 'theme-button-primary' : 'theme-button-secondary'}`}
              style={{ flex: 1, fontSize: '12px', padding: '8px 12px' }}
            >
              ☀️ Light Theme
            </button>
            
            <button
              onClick={() => this.setTheme('dark')}
              disabled={loading || currentTheme === 'dark'}
              className={`theme-button ${currentTheme === 'dark' ? 'theme-button-primary' : 'theme-button-secondary'}`}
              style={{ flex: 1, fontSize: '12px', padding: '8px 12px' }}
            >
              🌙 Dark Theme
            </button>
          </div>
          
          {/* Enhanced Status Information */}
          <div className="theme-info-box" style={{ padding: '8px', fontSize: '11px' }}>
            <div style={{ marginBottom: '4px' }}>
              <strong>Service Status:</strong>{' '}
              <span className={`theme-code ${serviceStatus === 'available' ? 'theme-text-success' : serviceStatus === 'unavailable' ? 'theme-text-error' : 'theme-text-warning'}`} style={{ marginLeft: '4px' }}>
                {serviceStatus === 'available' ? '✅ Available' : serviceStatus === 'unavailable' ? '❌ Unavailable' : '🔄 Checking'}
              </span>
            </div>
            <div style={{ marginBottom: '4px' }}>
              <strong>Last Action:</strong>{' '}
              <span className="theme-code" style={{ marginLeft: '4px' }}>{lastAction || 'None'}</span>
            </div>
            {retryCount > 0 && (
              <div style={{ marginBottom: '4px' }}>
                <strong>Retry Count:</strong>{' '}
                <span className="theme-code theme-text-warning" style={{ marginLeft: '4px' }}>{retryCount}</span>
              </div>
            )}
            <div>
              <strong>Service Methods:</strong>{' '}
              <span className="theme-code" style={{ marginLeft: '4px' }}>getSetting(), setSetting()</span>
            </div>
          </div>

          {/* Educational Footer */}
          <div style={{
            marginTop: '12px',
            padding: '6px',
            backgroundColor: 'var(--accent-bg)',
            border: '1px solid var(--accent-border)',
            borderRadius: '4px',
            fontSize: '9px',
            textAlign: 'center'
          }}>
            <span
              title="This component demonstrates comprehensive Settings Service Bridge usage with best practices including: service validation, error categorization, retry logic with exponential backoff, graceful degradation, transactional operations with rollback, and developer-friendly error handling."
              style={{ cursor: 'help', color: 'var(--text-muted)' }}
            >
              📚 Settings Service Bridge Demo with Best Practices - Hover for details
            </span>
          </div>

          {/* Important Demo Note */}
          <div style={{
            marginTop: '8px',
            padding: '8px',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffeaa7',
            borderRadius: '4px',
            fontSize: '10px',
            lineHeight: '1.4'
          }}>
            <div style={{ marginBottom: '4px', fontWeight: 'bold', color: '#856404' }}>
              📝 Demo Note:
            </div>
            <div style={{ color: '#856404' }}>
              This plugin demonstrates <strong>Settings Service Bridge</strong> usage only. Theme changes are saved to the database but don't affect the global app theme since this is an isolated demo. In a real implementation, the theme provider would listen for setting changes and update the entire application. You may need to refresh the browser to see changes reflected elsewhere in BrainDrive.
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default ThemeSelector;