import base64 from 'base-64';
import { handleError } from './errorUtils';

// TODO: better error handling!

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

function convertToApiUrl(repoUrl) {
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
    console.log('createBranch', repoApiURL, token, base);
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

    await fetch(repoGitRefUrl, {
        method: 'POST',
        headers: getDefaultGitHeaders(token),
        body: JSON.stringify(branchBody)
    });

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

// TODO: all requests should use this
function makeGitHubRequest(url, token, body, method = 'GET') {
    const stringifiedBody = body
        ? JSON.stringify(body)
        : null;

    return fetch(url, {
        headers: getDefaultGitHeaders(token),
        method,
        body: stringifiedBody
    });
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

export async function getRepoConfigFile(repoURL, token) {
    const repoApiURL = convertToApiUrl(repoURL);
    const repoContentsUrl = `${repoApiURL}/contents/${DEFAULT_CONFIG_PATH}`;
    
    try {
        const getConfigResponse = await makeGitHubRequest(repoContentsUrl, token);
        const getConfigJSON = await getConfigResponse.json();
        const decodedContent = base64.decode(getConfigJSON.content);
    
        return JSON.parse(decodedContent);
    } catch(error) {
        handleError('A config file was not found in the repo.');
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