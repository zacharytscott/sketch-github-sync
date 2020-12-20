import Settings from 'sketch/settings';

export function getTokenSetting() {
    return Settings.settingForKey('token');
}

export function getRepoUrlSetting() {
    return Settings.settingForKey('repoUrl');
}