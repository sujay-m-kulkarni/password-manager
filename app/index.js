/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { saveReport } from './src/components/CrashReportNotice';
import { recordedSteps, step } from './src/utils/steps';

step('app start');

// A fatal JavaScript error closes the app: store its report first, so the next launch shows it
// (with a Share button) before anything else runs.
const previous = global.ErrorUtils?.getGlobalHandler?.();
global.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
  if (isFatal) {
    const e = error instanceof Error ? error : new Error(String(error));
    const steps = recordedSteps();
    saveReport('App error (JavaScript)', `${e.name}: ${e.message}\n${e.stack ?? ''}${steps ? `\n\nLast steps:\n${steps}` : ''}`);
  }
  previous?.(error, isFatal);
});

AppRegistry.registerComponent(appName, () => App);
