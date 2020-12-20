import BrowserWindow from 'sketch-module-web-view';
import Settings from 'sketch/settings';
import { validate } from './gitHubUtils';

export default function() {
  const options = {
    identifier: 'config'
  };

  const browserWindow = new BrowserWindow(options);

  browserWindow.loadURL(require('./config.html'));

  const settings = {
    token: Settings.settingForKey('token'),
    repoUrl: Settings.settingForKey('repoUrl')
  };

  browserWindow.webContents
    .executeJavaScript(`setSettings(${JSON.stringify(settings)})`);

  browserWindow.webContents.on('settingsSaved', settings => {
    Settings.setSettingForKey('token', settings.token);
    Settings.setSettingForKey('repoUrl', settings.repoUrl);

    browserWindow.close();
  });

  browserWindow.webContents.on('validationRequested', settings => {
    validate(settings.repoUrl, settings.token)
      .then(results => {
        browserWindow.webContents
        .executeJavaScript(`settingsValidated(${JSON.stringify(results)})`);
      });
  });
}
