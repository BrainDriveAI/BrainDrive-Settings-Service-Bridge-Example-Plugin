# ServiceExample_Settings - Developer Guide

## 📚 Complete Guide to BrainDrive Settings Service Bridge

This guide provides comprehensive documentation for developers learning to use BrainDrive's Settings Service Bridge. The ServiceExample_Settings plugin serves as a working demonstration of all key concepts, patterns, and production-ready error handling techniques.

## 🎯 Learning Objectives

After studying this plugin and guide, you will understand:

1. **Settings Service Bridge Architecture** - How BrainDrive's settings system works
2. **Service Integration Patterns** - Proper ways to connect to BrainDrive services
3. **Persistent Configuration Management** - How to store and retrieve user settings
4. **Production-Ready Error Handling** - Comprehensive error handling with retry logic
5. **Best Practices** - Production-ready patterns and techniques
6. **Common Pitfalls** - What to avoid and how to debug issues

## 🏗️ Architecture Overview

### Settings Service Bridge Flow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Your Plugin   │    │  Settings       │    │   Database      │
│                 │    │  Service Bridge │    │                 │
│ 1. Get/Set      │───▶│ 2. Validate     │───▶│ 3. Store/       │
│    Settings     │    │    & Process    │    │    Retrieve     │
│                 │    │                 │    │                 │
│ 4. Handle       │◀───│ 5. Return       │◀───│ 6. Persist      │
│    Response     │    │    Result       │    │    Data         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Key Components

1. **Settings Service Bridge** - Provided by BrainDrive through `props.services.settings`
2. **Settings Definitions** - Schema and metadata for settings
3. **Settings Instances** - Actual stored values with scope and context
4. **Error Handling System** - Comprehensive error categorization and recovery

## 🔧 Implementation Guide

### Step 1: Service Integration and Validation

```typescript
// Service validation (from ThemeSelector.tsx)
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

// Component lifecycle integration
async componentDidMount() {
  await this.validateServices();
  await this.loadCurrentTheme();
}
```

### Step 2: Getting Settings with Error Handling

```typescript
// Load settings with comprehensive error handling (from ThemeSelector.tsx)
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
        });
        
        console.log('ServiceExample_Settings: Successfully loaded theme settings:', themeSettings);
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
```

### Step 3: Setting Settings with Transactional Operations

```typescript
// Set settings with validation, retry logic, and rollback (from ThemeSelector.tsx)
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
```

## 📋 Settings Structure

### Settings Definition Format

```typescript
// Settings definition structure (auto-generated by backend)
interface SettingDefinition {
  id: string;                    // Unique identifier (e.g., 'theme_settings')
  name: string;                  // Human-readable name
  description: string;           // Description of the setting
  category: string;              // Category for organization
  type: string;                  // Data type ('object', 'string', 'boolean', etc.)
  default_value: any;           // Default value when no setting exists
  allowed_scopes: string[];     // Allowed scopes ('user', 'system', 'page', etc.)
  is_multiple: boolean;         // Whether multiple instances are allowed
  tags: string[];               // Tags for categorization
}

// Example theme_settings definition
const themeSettingsDefinition = {
  id: "theme_settings",
  name: "Theme Settings",
  description: "User interface theme configuration",
  category: "appearance",
  type: "object",
  default_value: {
    theme: "light",
    useSystemTheme: false
  },
  allowed_scopes: ["user", "system"],
  is_multiple: false,
  tags: ["ui", "theme", "appearance"]
};
```

### Settings Instance Format

```typescript
// Settings instance structure (stored in database)
interface SettingInstance {
  id: string;                   // Unique instance ID
  definition_id: string;        // Reference to settings definition
  name: string;                 // Instance name (usually same as definition)
  value: any;                   // The actual stored value
  scope: 'user' | 'system' | 'page' | 'user_page';  // Scope of the setting
  user_id?: string;            // User ID for user-scoped settings
  page_id?: string;            // Page ID for page-scoped settings
  created_at: string;          // ISO timestamp of creation
  updated_at: string;          // ISO timestamp of last update
}

// Example theme_settings instance
const themeSettingsInstance = {
  id: "inst_123456",
  definition_id: "theme_settings",
  name: "theme_settings",
  value: {
    theme: "dark",
    useSystemTheme: false
  },
  scope: "user",
  user_id: "user_789",
  page_id: null,
  created_at: "2024-01-01T12:00:00Z",
  updated_at: "2024-01-02T15:30:00Z"
};
```

### Context and Scope Management

```typescript
// Context determines scope automatically
interface SettingsContext {
  userId?: string;              // User ID ('current' for current user)
  pageId?: string;             // Page ID for page-scoped settings
}

// Scope resolution rules
const scopeResolution = {
  // Both userId and pageId provided
  { userId: 'current', pageId: 'page123' } → scope: 'user_page',
  
  // Only userId provided
  { userId: 'current' } → scope: 'user',
  
  // Only pageId provided
  { pageId: 'page123' } → scope: 'page',
  
  // No context provided
  {} → scope: 'system'
};

// Usage examples
await this.props.services.settings.getSetting('theme_settings', { userId: 'current' });
await this.props.services.settings.setSetting('theme_settings', value, { userId: 'current' });
```

## 🚨 Error Handling System

### Error Categorization (from ThemeSelector.tsx)

```typescript
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
```

### Retry Logic with Exponential Backoff

```typescript
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
```

### Error Recovery Patterns

```typescript
// Graceful degradation with fallback values
const loadSettingsWithFallback = async (settingId: string, fallbackValue: any) => {
  try {
    const settings = await this.props.services.settings.getSetting(settingId, { userId: 'current' });
    return settings || fallbackValue;
  } catch (error) {
    console.warn(`Failed to load ${settingId}, using fallback:`, error);
    return fallbackValue;
  }
};

// Transactional operations with rollback
const updateSettingsWithRollback = async (settingId: string, newValue: any, currentValue: any) => {
  try {
    // Optimistic update
    this.setState({ currentValue: newValue });
    
    // Save to backend
    await this.props.services.settings.setSetting(settingId, newValue, { userId: 'current' });
    
    console.log('Settings updated successfully');
  } catch (error) {
    // Rollback on failure
    this.setState({ currentValue: currentValue });
    console.error('Settings update failed, rolled back:', error);
    throw error;
  }
};
```

## 🎨 UI Patterns

### Service Status Indicator

```typescript
// Visual indicator for service status (from ThemeSelector.tsx)
<div style={{ marginBottom: '4px' }}>
  <strong>Service Status:</strong> 
  <span className={`theme-code ${
    serviceStatus === 'available' ? 'theme-text-success' : 
    serviceStatus === 'unavailable' ? 'theme-text-error' : 
    'theme-text-warning'
  }`}>
    {serviceStatus === 'available' ? '✅ Available' : 
     serviceStatus === 'unavailable' ? '❌ Unavailable' : 
     '🔄 Checking'}
  </span>
</div>
```

### Error Display with User-Friendly Messages

```typescript
// Error display component
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
```

### Loading States and Progress Indicators

```typescript
// Loading state management
<button
  onClick={() => this.setTheme('dark')}
  disabled={loading || currentTheme === 'dark'}
  className={`theme-button ${currentTheme === 'dark' ? 'theme-button-primary' : 'theme-button-secondary'}`}
>
  {loading ? '🔄 Saving...' : '🌙 Dark Theme'}
</button>
```

## 🔍 Debugging and Monitoring

### Educational Logging

The plugin includes comprehensive logging for learning purposes:

```typescript
// Service validation logging
console.log('ServiceExample_Settings: Service validation passed');

// Operation logging
console.log('ServiceExample_Settings: Getting theme_settings with userId: current');
console.log('ServiceExample_Settings: Saving theme_settings with userId: current');

// Retry logging
console.log(`ServiceExample_Settings: Retrying operation (attempt 2/3) after 2000ms`);

// Error logging
console.error('ServiceExample_Settings: Error loading theme after retries:', error);

// Success logging
console.log('ServiceExample_Settings: Theme successfully updated:', updatedSettings);

// Rollback logging
console.log('ServiceExample_Settings: Rolled back to previous theme:', previousTheme);
```

### Settings Monitoring

```typescript
// Monitor settings changes
const monitorSettingsChanges = () => {
  console.group('Settings Operation Summary');
  console.log('Operation:', this.state.lastAction);
  console.log('Current Theme:', this.state.currentTheme);
  console.log('Service Status:', this.state.serviceStatus);
  console.log('Retry Count:', this.state.retryCount);
  console.log('Error State:', this.state.error);
  console.groupEnd();
};
```

## 💡 Best Practices

### 1. Service Lifecycle Management

```typescript
// Always validate services before use
async componentDidMount() {
  await this.validateServices();
  await this.loadCurrentTheme();
}

// Handle service availability changes
componentDidUpdate(prevProps: ThemeSelectorProps) {
  if (prevProps.services?.settings !== this.props.services?.settings) {
    console.log('Settings service availability changed, revalidating...');
    this.validateServices();
  }
}
```

### 2. Context Management

```typescript
// Always use proper context for user-scoped settings
const userContext = { userId: 'current' };

// Get user-scoped settings
const userSettings = await this.props.services.settings.getSetting('my_setting', userContext);

// Set user-scoped settings
await this.props.services.settings.setSetting('my_setting', value, userContext);
```

### 3. Data Validation

```typescript
// Validate settings data before use
const validateThemeSettings = (settings: any) => {
  if (!settings || typeof settings !== 'object') {
    return false;
  }
  
  if (settings.theme && !['light', 'dark'].includes(settings.theme)) {
    return false;
  }
  
  if (settings.useSystemTheme !== undefined && typeof settings.useSystemTheme !== 'boolean') {
    return false;
  }
  
  return true;
};
```

### 4. Error Handling

```typescript
// Always categorize errors and provide appropriate responses
const handleSettingsError = (error: any) => {
  const categorized = this.categorizeError(error);
  
  if (categorized.isRetryable) {
    // Implement retry logic
    return this.retryOperation(operation, 'operationName');
  } else {
    // Show user-friendly error and fallback
    this.setState({
      error: categorized.message,
      // Apply fallback state
    });
  }
};
```

## ⚠️ Common Pitfalls

### 1. Incorrect Context Usage

```typescript
// ❌ Wrong - using scope directly
await this.props.services.settings.getSetting('setting', { scope: 'user' });

// ✅ Correct - using userId for user scope
await this.props.services.settings.getSetting('setting', { userId: 'current' });
```

### 2. Not Handling Service Unavailability

```typescript
// ❌ Wrong - assuming service is always available
await this.props.services.settings.getSetting('setting');

// ✅ Correct - checking service availability
if (this.state.serviceStatus === 'available') {
  await this.props.services.settings.getSetting('setting', { userId: 'current' });
} else {
  // Use fallback or show error
}
```

### 3. Missing Error Recovery

```typescript
// ❌ Wrong - no error handling
const theme = await this.props.services.settings.getSetting('theme_settings');
this.setState({ currentTheme: theme.theme });

// ✅ Correct - comprehensive error handling
try {
  const theme = await this.retryOperation(() =>
    this.props.services.settings.getSetting('theme_settings', { userId: 'current' })
  );
  
  if (theme && theme.theme && ['light', 'dark'].includes(theme.theme)) {
    this.setState({ currentTheme: theme.theme });
  } else {
    this.setState({ currentTheme: 'light' }); // Fallback
  }
} catch (error) {
  const categorized = this.categorizeError(error);
  this.setState({ 
    currentTheme: 'light', // Fallback
    error: categorized.message 
  });
}
```

## 🧪 Testing Patterns

### 1. Component Testing

```typescript
// Test service validation
describe('Service Validation', () => {
  it('should validate required service methods', async () => {
    const mockServices = {
      settings: {
        getSetting: jest.fn(),
        setSetting: jest.fn()
      }
    };
    
    const component = new ThemeSelector({ services: mockServices });
    await expect(component.validateServices()).resolves.not.toThrow();
  });
  
  it('should handle missing service', async () => {
    const component = new ThemeSelector({ services: {} });
    await expect(component.validateServices()).rejects.toThrow('Settings service is not available');
  });
});
```

### 2. Error Handling Testing

```typescript
// Test error categorization
describe('Error Categorization', () => {
  it('should categorize network errors as retryable', () => {
    const component = new ThemeSelector({ services: mockServices });
    const error = new Error('Network timeout');
    const categorized = component.categorizeError(error);
    
    expect(categorized.type).toBe('network');
    expect(categorized.isRetryable).toBe(true);
  });
  
  it('should categorize permission errors as non-retryable', () => {
    const component = new ThemeSelector({ services: mockServices });
    const error = new Error('Unauthorized access');
    const categorized = component.categorizeError(error);
    
    expect(categorized.type).toBe('permission');
    expect(categorized.isRetryable).toBe(false);
  });
});
```

## 📚 Reference Materials

### Code Examples
- `src/components/ThemeSelector.tsx` - Complete implementation with error handling
- `src/styles/theme-settings.css` - Theme-aware styling patterns
- `lifecycle_manager.py` - Plugin lifecycle management

### Educational Features
- Comprehensive error categorization and handling
- Retry logic with exponential backoff
- Service validation and graceful degradation
- Transactional operations with rollback
- Real-time status monitoring and logging

### Development Tools
- Browser console logging for debugging
- Visual service status indicators
- Error message display with categorization
- Retry count monitoring
- Operation history tracking

## 🎓 Next Steps

After mastering this plugin, explore:

1. **Advanced Settings Patterns** - Multi-level settings, inheritance, and defaults
2. **Settings Synchronization** - Cross-device and real-time sync patterns
3. **Settings Validation** - Schema validation and data integrity
4. **Performance Optimization** - Caching, batching, and lazy loading
5. **Settings Migration** - Handling schema changes and data migration

## 💡 Tips for Success

1. **Always validate services** before attempting operations
2. **Use proper context** for scope management (`{ userId: 'current' }`)
3. **Implement comprehensive error handling** with categorization and retry logic
4. **Provide fallback values** for graceful degradation
5. **Use transactional patterns** with rollback capabilities
6. **Log operations thoroughly** for debugging and monitoring
7. **Test error scenarios** as thoroughly as success scenarios
8. **Keep user experience smooth** with optimistic updates and loading states

## 🚨 Important Demo Limitation

**This plugin is a Settings Service Bridge demonstration only.** The theme changes are saved to the database using the Settings Service Bridge, but they don't affect the global BrainDrive theme because:

1. **Isolated Demo**: This plugin operates independently to showcase Settings Service Bridge functionality
2. **No Theme Provider Integration**: Real theme changes would require integration with BrainDrive's theme provider
3. **Database Only**: Settings are properly stored and retrieved, but the global UI theme remains unchanged
4. **Production Implementation**: In a real application, you would:
   - Listen for theme setting changes in the theme provider
   - Update CSS variables or theme context globally
   - Notify all components of theme changes
   - Implement real-time theme switching across the entire application

**For testing**: You may need to refresh the browser to see any theme-related changes reflected elsewhere in BrainDrive, as this demo focuses purely on the Settings Service Bridge functionality.

---

**Master BrainDrive's Settings Service Bridge! ⚙️**

*This guide demonstrates production-ready patterns for persistent configuration management in BrainDrive plugins.*