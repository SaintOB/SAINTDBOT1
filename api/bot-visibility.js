const REPO_OWNER = 'SaintOB';
const REPO_NAME = 'SAINTDBOT1';
const CONFIG_PATH = 'config/bot-visibility.json';
const BRANCH = 'main';

const DEFAULT_VISIBILITY = {
    public: ['saint-eo-hunter', 'saint-eo-pro', 'saint-eo-complete-05'],
    preview: [],
    deleted: [],
};

const normaliseList = value => (Array.isArray(value) ? value.filter(item => typeof item === 'string') : []);

const json = (res, status, payload) => {
    res.status(status).setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
};

const githubHeaders = token => ({
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
});

const getGithubFile = async token => {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${CONFIG_PATH}?ref=${BRANCH}`;
    const response = await fetch(url, { headers: githubHeaders(token) });
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data?.message || `GitHub read failed with ${response.status}`);
    }

    const decoded = Buffer.from(data.content || '', 'base64').toString('utf8');
    return { sha: data.sha, json: JSON.parse(decoded) };
};

const updateGithubFile = async (token, currentSha, visibility) => {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${CONFIG_PATH}`;
    const content = JSON.stringify({ ...visibility, _ts: Date.now() }, null, 2) + '\n';

    const response = await fetch(url, {
        method: 'PUT',
        headers: githubHeaders(token),
        body: JSON.stringify({
            message: 'Update bot visibility settings',
            content: Buffer.from(content, 'utf8').toString('base64'),
            sha: currentSha,
            branch: BRANCH,
        }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data?.message || `GitHub write failed with ${response.status}`);
    }

    return data;
};

export default async function handler(req, res) {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

    if (req.method === 'GET') {
        if (!token) {
            return json(res, 200, { ...DEFAULT_VISIBILITY, dbSaved: false, cloudConfigured: false });
        }

        try {
            const current = await getGithubFile(token);
            return json(res, 200, {
                public: normaliseList(current.json.public),
                preview: normaliseList(current.json.preview),
                deleted: normaliseList(current.json.deleted),
                dbSaved: true,
                cloudConfigured: true,
            });
        } catch (error) {
            return json(res, 200, { ...DEFAULT_VISIBILITY, dbSaved: false, cloudConfigured: true, error: error.message });
        }
    }

    if (req.method === 'POST') {
        const visibility = {
            public: normaliseList(req.body?.public),
            preview: normaliseList(req.body?.preview),
            deleted: normaliseList(req.body?.deleted),
        };

        if (!token) {
            return json(res, 200, {
                ...visibility,
                dbSaved: false,
                cloudConfigured: false,
                error: 'Missing GITHUB_TOKEN in Vercel environment variables.',
            });
        }

        try {
            const current = await getGithubFile(token);
            await updateGithubFile(token, current.sha, visibility);
            return json(res, 200, { ...visibility, dbSaved: true, cloudConfigured: true });
        } catch (error) {
            return json(res, 200, { ...visibility, dbSaved: false, cloudConfigured: true, error: error.message });
        }
    }

    return json(res, 405, { error: 'method_not_allowed' });
}
