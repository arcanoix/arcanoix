import { readFileSync, writeFileSync } from 'node:fs';

const USERNAME = 'arcanoix';
const MAX_ITEMS = 6;
const TARGET_FILE = 'README.md';

const START_TAG = '<!--START_SECTION:activity-->';
const END_TAG = '<!--END_SECTION:activity-->';

const token = process.env.GITHUB_TOKEN;
const headers = {
  'User-Agent': 'arcanoix-activity-script',
  Accept: 'application/vnd.github.v3+json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

async function fetchJson(url) {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function formatEvent(event) {
  const repoName = event.repo.name;
  const repoUrl = `https://github.com/${repoName}`;

  // Never show activity on the profile repo itself
  if (repoName === `${USERNAME}/${USERNAME}`) {
    return null;
  }

  switch (event.type) {
    case 'PushEvent': {
      const head = event.payload?.head;
      let commitSnippet = '';
      if (head) {
        const commitData = await fetchJson(`https://api.github.com/repos/${repoName}/commits/${head}`);
        if (commitData?.commit?.message) {
          const rawMsg = commitData.commit.message.split('\n')[0].trim();
          const cleanMsg = rawMsg.length > 55 ? `${rawMsg.slice(0, 52)}...` : rawMsg;
          commitSnippet = `: \`${cleanMsg}\``;
        }
      }
      return `🔨 Pushed to [${repoName}](${repoUrl})${commitSnippet}`;
    }

    case 'PullRequestEvent': {
      const action = event.payload?.action;
      const pr = event.payload?.pull_request;
      const prNum = pr?.number ?? event.payload?.number;
      const prUrl = pr?.html_url ?? `${repoUrl}/pull/${prNum}`;
      if (action === 'closed' && pr?.merged) {
        return `🎉 Merged PR [#${prNum}](${prUrl}) in [${repoName}](${repoUrl})`;
      }
      if (action === 'opened') {
        return `💪 Opened PR [#${prNum}](${prUrl}) in [${repoName}](${repoUrl})`;
      }
      if (action === 'closed') {
        return `❌ Closed PR [#${prNum}](${prUrl}) in [${repoName}](${repoUrl})`;
      }
      return null;
    }

    case 'IssuesEvent': {
      const action = event.payload?.action;
      const issue = event.payload?.issue;
      const issueNum = issue?.number ?? event.payload?.number;
      const issueUrl = issue?.html_url ?? `${repoUrl}/issues/${issueNum}`;
      if (action === 'opened') {
        return `❗ Opened issue [#${issueNum}](${issueUrl}) in [${repoName}](${repoUrl})`;
      }
      if (action === 'closed') {
        return `🔒 Closed issue [#${issueNum}](${issueUrl}) in [${repoName}](${repoUrl})`;
      }
      return null;
    }

    case 'IssueCommentEvent': {
      if (event.payload?.action !== 'created') return null;
      const issue = event.payload?.issue;
      const comment = event.payload?.comment;
      const issueNum = issue?.number;
      const commentUrl = comment?.html_url ?? issue?.html_url ?? `${repoUrl}/issues/${issueNum}`;
      return `🗣 Commented on [#${issueNum}](${commentUrl}) in [${repoName}](${repoUrl})`;
    }

    case 'CreateEvent': {
      const refType = event.payload?.ref_type;
      if (refType === 'repository') {
        return `🌱 Created repository [${repoName}](${repoUrl})`;
      }
      return null;
    }

    case 'ForkEvent': {
      const forkee = event.payload?.forkee;
      const targetUrl = forkee?.html_url ?? repoUrl;
      return `🍴 Forked [${repoName}](${targetUrl})`;
    }

    case 'WatchEvent': {
      if (event.payload?.action === 'started') {
        return `⭐ Starred [${repoName}](${repoUrl})`;
      }
      return null;
    }

    case 'ReleaseEvent': {
      const releaseName = event.payload?.release?.name || event.payload?.release?.tag_name || 'release';
      const releaseUrl = event.payload?.release?.html_url ?? `${repoUrl}/releases`;
      return `🚀 Released [${releaseName}](${releaseUrl}) in [${repoName}](${repoUrl})`;
    }

    default:
      return null;
  }
}

async function main() {
  console.log(`Fetching events for ${USERNAME}...`);
  const events = await fetchJson(`https://api.github.com/users/${USERNAME}/events/public?per_page=100`);

  if (!events || !Array.isArray(events)) {
    console.error('Failed to fetch public events');
    process.exit(1);
  }

  const lines = [];
  const seenKeys = new Set();

  for (const event of events) {
    if (lines.length >= MAX_ITEMS) break;

    const formatted = await formatEvent(event);
    if (!formatted) continue;

    // Deduplicate repetitive events
    if (seenKeys.has(formatted)) continue;
    seenKeys.add(formatted);

    lines.push(formatted);
  }

  if (lines.length === 0) {
    console.log('No recent activities found.');
    return;
  }

  const numberedLines = lines.map((line, idx) => `${idx + 1}. ${line}`).join('\n');
  console.log('\nGenerated Activity:\n' + numberedLines + '\n');

  const readme = readFileSync(TARGET_FILE, 'utf-8');
  const startIdx = readme.indexOf(START_TAG);
  const endIdx = readme.indexOf(END_TAG);

  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    console.error('Could not find start or end tags in README.md');
    process.exit(1);
  }

  const before = readme.substring(0, startIdx + START_TAG.length);
  const after = readme.substring(endIdx);

  const updatedReadme = `${before}\n${numberedLines}\n${after}`;
  writeFileSync(TARGET_FILE, updatedReadme, 'utf-8');
  console.log(`Successfully updated ${TARGET_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
