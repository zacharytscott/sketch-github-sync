import sketch from 'sketch';
import dom from 'sketch/dom';
import async from 'sketch/async';
import { getConvertedContents, getFileFormat } from './cssUtils';
import { getRepoConfigFile, pushAndOpenPullRequest } from './gitHubUtils';
import { getTokenSetting, getRepoUrlSetting } from './settingUtils';

// TODO: better error handling
// TODO: add magic search for config file!
// TODO: if config file doesn't exist, use defaults and warn!
// TODO: check for changes when the user clicks the sync button!
// TODO: we could use a recognizable comment to ensure we only overwrite a portion of the file, never the whole thing.
// TODO: include link in PR message

function convertSelectedDocumentContents(format) {
  const doc = dom.Document.getSelectedDocument();

  return getConvertedContents(doc, format);
}

// TODO: break this up?
async function attemptPullRequest(repoUrl, token) {
  const fiber = async.createFiber();

  const configFile = await getRepoConfigFile(repoUrl, token);

  const fileFormat = getFileFormat(configFile.globalStylesFilePath);

  const contents = convertSelectedDocumentContents(fileFormat);

  await pushAndOpenPullRequest(repoUrl, token, contents, configFile.baseBranch, configFile.globalStylesFilePath);

  fiber.cleanup();
}

function isValid(repoUrl, token) {
  return token && repoUrl && token.length > 0 && repoUrl.length > 0;
}

export default async function() {
  const token = getTokenSetting();
  const repoUrl = getRepoUrlSetting();

  if (isValid(repoUrl, token)) {
    sketch.UI.message('Creating a Pull Request...');

    await attemptPullRequest(repoUrl, token);

    sketch.UI.message('Pull Request created!');
  } else {
    sketch.UI.message('Please configure your GitHub settings by clicking "configure" in the plugin menu. 😀');
  }
}
