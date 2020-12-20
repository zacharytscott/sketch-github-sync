import base64 from 'base-64';
import { handleError } from './errorUtils';

const GITHUB_DOMAIN = "github.com/";
const GITHUB_API_URL = "https://api.github.com/repos";
const DEFAULT_CONFIG_PATH = 'orbital.conf.json';

function getOwner(repoUrl) {
    const urlAfterGithub = repoUrl.substring(repoUrl.indexOf(GITHUB_DOMAIN) + GITHUB_DOMAIN.length);

    return urlAfterGithub.substring(0, urlAfterGithub.indexOf('/'));
}

function getRepoName(repoUrl) {
    return repoUrl.substring(repoUrl.lastIndexOf('/') + 1);
}

export function convertToApiUrl(repoUrl) {
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

// TODO: break this up
async function createBranch(repoApiURL, token, base) {
    const repoGitRefUrl = `${repoApiURL}/git/refs`;

    const getRefsResponse = await makeGitHubRequest(repoGitRefUrl, token);

    const refs = await getRefsResponse.json();

    const newBranchSha = refs.find(ref => ref.ref === `refs/heads/${base}`).object.sha;

    const newBranchName = `orbital-${Math.floor(Math.random() * 1000000000000)}`;

    const branchBody = {
        ref: `refs/heads/${newBranchName}`,
        sha: newBranchSha
    };

    await makeGitHubRequest(repoGitRefUrl, token, branchBody, 'POST');

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

    await makeGitHubRequest(repoPullUrl, token, pullBody, 'POST');
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

// TODO:  break into two functions, remove flag
async function makeGitHubRequest(url, token, body, method = 'GET', handleError = true) {
    const stringifiedBody = body
        ? JSON.stringify(body)
        : null;

    const res = await fetch(url, {
        headers: getDefaultGitHeaders(token),
        method,
        body: stringifiedBody
    });

    if (handleError && !res.ok) {
        const errorMessage = `${res.status}: ${res.statusText}`;

        handleError(errorMessage);

        throw errorMessage;
    }

    return res;
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

export async function getRepoConfigFile(repoUrl, token) {
    const repoApiURL = convertToApiUrl(repoUrl);
    const repoContentsUrl = `${repoApiURL}/contents/${DEFAULT_CONFIG_PATH}`;
    
    const getConfigResponse = await makeGitHubRequest(repoContentsUrl, token);
    const getConfigJSON = await getConfigResponse.json();
    const decodedContent = base64.decode(getConfigJSON.content);

    return JSON.parse(decodedContent);
}

export async function getRepoConfigFileAndHandleErrors(repoUrl, token) {
    try {
        return await getRepoConfigFile(repoUrl, token);
    } catch(error) {
        handleError(`There was an issue parsing the config file: ${error}`);
    }
}

// TODO: break this up
export async function pushAndOpenPullRequest(repoUrl, token, contents, baseBranch, globalStylesFilePath) {
    const repoApiURL = convertToApiUrl(repoUrl);

    const {
        newBranchName,
        newBranchSha
    } = await createBranch(repoApiURL, token, baseBranch);

    const blobSha = await createBlob(repoApiURL, token, contents);

    const baseTreeSha = await getTreeSha(repoApiURL, token, newBranchSha);

    const newTreeSha = await createNewTree(repoApiURL, token, baseTreeSha, blobSha, globalStylesFilePath);

    const newCommitSha = await createCommit(repoApiURL, token, newBranchSha, newTreeSha);

    await updateBranchHead(repoApiURL, token, newBranchName, newCommitSha);

    return await createPR(repoApiURL, token, baseBranch, newBranchName);
}

// TODO: this is too big
export async function validate(url, token) {
    const repoApiURL = convertToApiUrl(url);

    const results = await makeGitHubRequest(repoApiURL, token, null, 'GET', false);

    if (!results.ok) {
        return {
            ok: false,
            errorMessage: "Hmm, we can't find that repo. It may not exist, or you may not have access to it."
        }
    }

    const resultsJSON = await results.json();

    if (!resultsJSON.permissions.push) {
        return {
            ok: false,
            errorMessage: "Uh oh! It looks like you don't have permissions to push to this repo. Contact your GitHub admin for access."
        }
    }

    // TODO: add option for them to configure without the file
    try {
        await getRepoConfigFile(url, token);
    } catch (error) {
        return {
            ok: false,
            errorMessage: `This repo does not have a file named ${DEFAULT_CONFIG_PATH} in its root. Ask the code maintainers if they could create one for you. 😉`
        }
    }


    return { ok: true };
}