import sketch from 'sketch';
import dom from 'sketch/dom';
import Settings from 'sketch/settings';
import async from 'sketch/async';
import base64 from 'base-64';

// TODO: add magic search for config file!
// TODO: if config file doesn't exist, use defaults and warn!
// TODO: check for changes when the user clicks the sync button!
// TODO: we could use a recognizable comment to ensure we only overwrite a portion of the file, never the whole thing.
// TODO: break into at least two modules: github and css conversion, settings

const GITHUB_DOMAIN = "github.com/";
const GITHUB_API_URL = "https://api.github.com/repos";
const DEFAULT_CONFIG_PATH = 'orbital.conf.json';

const WARNING_COMMENT = '/********************************\n\t Hey devs! This file was lovingly crafted by the design team and automatically synced through GitHub.\n\t Be careful about making any changes, as they may be overwritten next time this is synced!\n\t If you need to extend this file, it\'s reccommended that you create an additional CSS file and reference these values there.\n********************************/\n\n';

// CSS

const variablePrefixes = {
  css: '--',
  scss: '$',
  less: '@',
  styl: ''
};

const variableSuffixes = {
  css: ': ',
  scss: ': ',
  less: ': ',
  styl: ' = '
};

const lineSuffixes = {
  css: ';\n',
  scss: ';\n',
  less: ';\n',
  styl: '\n'
};

const gradientTypes = {
  "Style.GradientType.Linear": 'linear',
  "Style.GradientType.Radial": 'radial'
};

function getConvertedContents(format) {
  const doc = dom.Document.getSelectedDocument();

  const colors = doc.swatches.map(color => wrapVariableForFormat(format, color.name, color.color));

  const gradients = doc.gradients.map(gradient => wrapVariableForFormat(format, gradient.name, convertToCssGradient(gradient.gradient)));

  let fileContents = `/* Colors */\n${colors.join('')}\n/* Gradients */\n${gradients.join('')}`

  if (format === 'css') {
    fileContents = `:root{\n\t${fileContents.replaceAll('\n', '\n\t')}\n}`;
  }
  
  fileContents = `${WARNING_COMMENT}${fileContents}\n`
  
  return fileContents;
}

function wrapVariableForFormat(format, name, value) {
  return `${variablePrefixes[format]}${convertToKebabAndNormalize(name)}${variableSuffixes[format]}${value}${lineSuffixes[format]}`
}

function convertToKebabAndNormalize(string) {
  const lowercase = string.toLowerCase().replaceAll(/[^A-Za-z ]/g, '');

  return lowercase.replaceAll(/\s/g, '-');
}

function getStopValue(stop, gradient) {
  return gradient.gradientType == 'Style.GradientType.Linear' ?
    `${stop.color} ${stop.position * 100}%` :
    stop.color;
}

function getAngle(gradient) {
  const opposite = gradient.from.y + gradient.to.y;
  const adjacent = gradient.from.x + gradient.to.x;

  return Math.atan(opposite / adjacent) * 180 / Math.PI;
}

function getAngleIfNeeded(gradient) {
  return gradient.gradientType === 'Style.GradientType.Linear' ?
    `${getAngle(gradient)}deg, ` :
    '';
}

function convertToCssGradient(gradient) {
  const stops = gradient.stops
    .map(stop => getStopValue(stop, gradient))
    .join(', ');

  return `${gradientTypes[gradient.gradientType]}-gradient(${getAngleIfNeeded(gradient)}${stops})`;
}

// END CSS

// GITHUB

function getOwner(repoUrl) {
  const urlAfterGithub = repoUrl.substring(repoUrl.indexOf(GITHUB_DOMAIN) + GITHUB_DOMAIN.length);

  return urlAfterGithub.substring(0, urlAfterGithub.indexOf('/'));
}

function getRepoName(repoUrl) {
  return repoUrl.substring(repoUrl.lastIndexOf('/') + 1);
}

function parseRepoApiURL(repoUrl) {
  const owner = getOwner(repoUrl);
  const repoName = getRepoName(repoUrl);

  return `${GITHUB_API_URL}/${owner}/${repoName}`;
}

function getDefaultGitHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json'
  }
}

async function createBranch(repoApiURL, token, base) {
  const repoGitRefUrl = `${repoApiURL}/git/refs`;

  const getRefsResponse = await fetch(repoGitRefUrl, {
    headers: getDefaultGitHeaders(token)
  });

  const refs = await getRefsResponse.json();

  const newBranchSha = refs.find(ref => ref.ref === `refs/heads/${base}`).object.sha;

  const newBranchName = `orbital-${Math.floor(Math.random() * 1000000000000)}`;

  const branchBody = {
    ref: `refs/heads/${newBranchName}`,
    sha: newBranchSha
  };

  const createBranchResponse = await fetch(repoGitRefUrl, {
    method: 'POST',
    headers: getDefaultGitHeaders(token),
    body: JSON.stringify(branchBody)
  });

  const createBranchResponseJson = await createBranchResponse.json();

  return {
    newBranchName,
    newBranchSha
  };
}

async function createPR(repoApiURL, token, base, newBranchName) {
  const repoPullUrl = `${repoApiURL}/pulls`;

  const pullBody = {
    title: 'Updating global styling',
    body: 'The design team has some changes for your global styling! 🤩',
    head: newBranchName,
    base
  };

  try {
    await fetch(repoPullUrl, {
      method: 'POST',
      headers: getDefaultGitHeaders(token),
      body: JSON.stringify(pullBody)
    });
  } catch (error) {
    console.log(error)
  }
}

async function createBlob(repoApiURL, token, content) {
  const repoBlobUrl = `${repoApiURL}/git/blobs`;

  const body = {
    content
  };

  const createBlobResponse = await makeGitHubRequest(repoBlobUrl, token, body, 'POST');
  const blobResponseJson = await createBlobResponse.json();

  return blobResponseJson.sha;
}

function makeGitHubRequest(url, token, body, method = 'GET') {
	const stringifiedBody = body
  	? JSON.stringify(body)
    : null;
    
  let response;
  
  try {
  	response = fetch(url, {
      headers: getDefaultGitHeaders(token),
      method,
      body: stringifiedBody
    });
  } catch(error) {
  	throw error;
  }
    
  return response;
}

async function getTreeSha(repoApiURL, token, commitHash) {
  const repoCommitUrl = `${repoApiURL}/git/commits/${commitHash}`;

  const getCommitResponse = await makeGitHubRequest(repoCommitUrl, token);
  
  const commitResponseJSON = await getCommitResponse.json();

  return commitResponseJSON.tree.sha;
}

async function createNewTree(repoApiURL, token, baseTreeSha, blobSha, path) {
  const repoTreeUrl = `${repoApiURL}/git/trees`;

  const body = {
    "base_tree": baseTreeSha,
    tree: [{
      path,
      mode: '100644',
      type: 'blob',
      sha: blobSha
    }]
  };

  const createTreeResponse = await makeGitHubRequest(repoTreeUrl, token, body, 'POST');
  const createTreeJSON = await createTreeResponse.json();

  return createTreeJSON.sha;
}

async function createCommit(repoApiURL, token, branchCommitSha, treeSha) {
  const repoCommitUrl = `${repoApiURL}/git/commits`;

  const body = {
    "message": "Updated global styles",
    "parents": [branchCommitSha],
    "tree": treeSha
  };
  
  const createCommitResponse = await makeGitHubRequest(repoCommitUrl, token, body, 'POST');
  const createCommitJSON = await createCommitResponse.json();
  
  return createCommitJSON.sha;
}

async function updateBranchHead(repoApiURL, token, newBranchName, newCommitSha) {
	const repoGitRefUrl = `${repoApiURL}/git/refs/heads/${newBranchName}`;
  
  const body = {
  	sha: newCommitSha
  };
  
  await makeGitHubRequest(repoGitRefUrl, token, body, 'PATCH');
}

function getFileFormat(filePath) {
	const format = filePath.substring(filePath.lastIndexOf('.') + 1).toLowerCase();
  
  if (!Object.keys(variablePrefixes).includes(format)) {
  	throw `unrecognized file format '${format}'!`;
  }
  
  return format;
}

function getRepoApiURL() {
  const repoUrl = Settings.settingForKey('repoUrl');
	return parseRepoApiURL(repoUrl);
}

async function getConfigFile(repoApiURL, token) {
  const repoContentsUrl = `${repoApiURL}/contents/${DEFAULT_CONFIG_PATH}`;
  
  const getConfigResponse = await makeGitHubRequest(repoContentsUrl, token);
  const getConfigJSON = await getConfigResponse.json();
  const decodedContent = base64.decode(getConfigJSON.content);
  
  return JSON.parse(decodedContent);
}

export default async function() {
  const fiber = async.createFiber();

  const repoApiURL = getRepoApiURL();
  const token = Settings.settingForKey('token');
  
  const configFile = await getConfigFile(repoApiURL, token);

  if (configFile) {
    const base = configFile.baseBranch;
    const filePath = configFile.globalStylesFilePath;

      const {
        newBranchName,
        newBranchSha
      } = await createBranch(repoApiURL, token, base);
      
      const fileFormat = getFileFormat(filePath);
    
      const blobContents = getConvertedContents(fileFormat);
    
      const blobSha = await createBlob(repoApiURL, token, blobContents);
    
      const baseTreeSha = await getTreeSha(repoApiURL, token, newBranchSha);
    
      const newTreeSha = await createNewTree(repoApiURL, token, baseTreeSha, blobSha, filePath);
    
      const newCommitSha = await createCommit(repoApiURL, token, newBranchSha, newTreeSha);
      
      await updateBranchHead(repoApiURL, token, newBranchName, newCommitSha);
      
      await createPR(repoApiURL, token, base, newBranchName);
        
      sketch.UI.message('Pull request created!');
  } else {
    sketch.UI.message(`No config file was found at the root of the repo! Make sure to add a file called ${DEFAULT_CONFIG_PATH}.`);
  }

  fiber.cleanup();
}
