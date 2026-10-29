import { execFileSync, execSync } from 'child_process';
import * as fs from 'fs';

const versionType = process.argv[2];
const preid = process.argv[3];
const changelogPath = 'CHANGELOG.md';

// Build npm version command
const versionArgs = [
  'version',
  '--commit-hooks',
  'false',
  '--git-tag-version',
  'false',
  versionType,
];
if (preid && preid.trim() !== '') {
  versionArgs.push(`--preid=${preid}`);
  console.log(`Using preid: ${preid}`);
}

console.log('Bumping version in root package.json');
execFileSync('npm', versionArgs, {
  stdio: 'inherit',
});

// Get the new version
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const newVersion = packageJson.version;

console.log(`New version: ${newVersion}`);

// Update changelog
console.log(`Checking for changelog at: ${changelogPath}`);
let changelog;
try {
  changelog = fs.readFileSync(changelogPath, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.log(
    `No changelog found at ${changelogPath}, skipping changelog update`,
  );
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${newVersion}\n`);
  process.exit(0);
}

// Get PRs since last tag
console.log('Fetching PRs since last tagged version...');
let latestTag;
try {
  latestTag = execSync('git describe --tags --abbrev=0', {
    encoding: 'utf8',
  }).trim();
  console.log(`Latest tag: ${latestTag}`);
} catch (error) {
  console.log('No previous tags found, using all commits');
  latestTag = '';
}

// Get commit range
const commitRange = latestTag ? `${latestTag}..HEAD` : 'HEAD';

// Get all PR numbers from commit messages
let commits;
try {
  commits = execSync(`git log ${commitRange} --oneline`, { encoding: 'utf8' });
} catch (error) {
  console.log('No commits found');
  commits = '';
}

// Extract PR numbers from merge commits
const prNumbers = [];
const prRegex = /#(\d+)/g;
let match;
while ((match = prRegex.exec(commits)) !== null) {
  prNumbers.push(match[1]);
}

console.log(`Found ${prNumbers.length} PRs since last tag`);

// Check which PR numbers are missing from changelog
const missingPrNumbers = prNumbers.filter(
  (prNum) => !changelog.includes(`#${prNum}`),
);
const missingEntries = [];

if (missingPrNumbers.length === 0) {
  console.log('All PRs are already in the changelog');
} else {
  console.log(
    `Found ${missingPrNumbers.length} missing PRs, fetching details...`,
  );

  // Get repository info for PR links
  let repoFullName;
  try {
    const remoteUrl = execSync('git config --get remote.origin.url', {
      encoding: 'utf8',
    }).trim();
    const repoMatch = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);
    repoFullName = repoMatch ? repoMatch[1] : null;
  } catch (error) {
    console.log('Could not determine repository name');
    repoFullName = null;
  }

  // Fetch PR details using gh CLI only for missing PRs
  for (const prNumber of missingPrNumbers) {
    try {
      const prJson = execSync(
        `gh pr view ${prNumber} --json title,author,number`,
        { encoding: 'utf8' },
      );
      const pr = JSON.parse(prJson);

      // Skip dependabot PRs
      if (pr.author.login.includes('dependabot')) {
        console.log(`Skipping dependabot PR #${prNumber}`);
        continue;
      }

      const prUrl = repoFullName
        ? `https://github.com/${repoFullName}/pull/${pr.number}`
        : `#${pr.number}`;
      const entry = `- ${pr.title} ([#${pr.number}](${prUrl})) (by [${pr.author.login}](https://github.com/${pr.author.login}))`;
      missingEntries.push(entry);
      console.log(`Added: ${entry}`);
    } catch (error) {
      console.log(
        `Could not fetch details for PR #${prNumber}: ${error.message}`,
      );
    }
  }
}

// Replace "## master" with the new version number
changelog = changelog.replace('## master', `## ${newVersion}`);

// Remove placeholder lines
changelog = changelog.replaceAll('- _...Add new stuff here..._\n', '');

// Build the new master section header (using array join to avoid YAML issues)
const masterSection = [
  '## master',
  '### ✨ Features and improvements',
  '- _...Add new stuff here..._',
  '',
  '### 🐞 Bug fixes',
  '- _...Add new stuff here..._',
  '',
  '',
].join('\n');

// Find where the content starts after the title header
// Expected format: "# tileserver-gl changelog\n\n## <version>"
const titleMatch = changelog.match(/^(# .+?\n\n)/);
let title = '';
let rest = changelog;

if (titleMatch) {
  title = titleMatch[1];
  rest = changelog.slice(title.length);
}

// Find the end of the new version's Bug fixes section to insert missing entries there
// Pattern: look for "### 🐞 Bug fixes\n" followed by content until next "## " heading
if (missingEntries.length > 0) {
  console.log(
    `Adding ${missingEntries.length} missing PR entries to changelog`,
  );
  const bugFixesPattern =
    /^(## [^\n]+\n### ✨ Features and improvements\n*### 🐞 Bug fixes\n)/m;
  const bugFixesMatch = rest.match(bugFixesPattern);

  if (bugFixesMatch) {
    // Insert entries after the Bug fixes header
    const insertPoint = bugFixesMatch.index + bugFixesMatch[1].length;
    const entriesText = '\n' + missingEntries.join('\n') + '\n';
    rest = rest.slice(0, insertPoint) + entriesText + rest.slice(insertPoint);
  } else {
    // Fallback: just add after version header if pattern not found
    rest = rest + '\n' + missingEntries.join('\n') + '\n';
  }
}

// A prerelease is a step towards whatever ships next, so its entries belong
// in the new section. Fold in the prerelease sections directly below it, the
// way release PRs have been cleaned up by hand until now.
const sections = rest.split(/^(?=## )/m);
const parseSection = (text) => {
  const lines = text.trimEnd().split('\n');
  const heading = lines.shift();
  const subsections = new Map();
  let current = null;
  for (const line of lines) {
    if (line.startsWith('### ')) {
      current = line;
      if (!subsections.has(current)) subsections.set(current, []);
    } else if (current && line.trim() !== '') {
      subsections.get(current).push(line);
    }
  }
  return { heading, subsections };
};
const newSection = parseSection(sections[0]);
while (
  sections.length > 1 &&
  sections[1].startsWith('## ') &&
  sections[1].split('\n')[0].includes('-')
) {
  const prerelease = parseSection(sections.splice(1, 1)[0]);
  console.log(`Folding ${prerelease.heading.slice(3)} into ${newVersion}`);
  for (const [subsection, entries] of prerelease.subsections) {
    if (!newSection.subsections.has(subsection))
      newSection.subsections.set(subsection, []);
    const target = newSection.subsections.get(subsection);
    for (const entry of entries) {
      if (!target.includes(entry)) target.push(entry);
    }
  }
}
sections[0] = [
  newSection.heading,
  ...[...newSection.subsections]
    .filter(([, entries]) => entries.length > 0)
    .map(([subsection, entries]) => [subsection, ...entries, ''].join('\n')),
  '',
].join('\n');
rest = sections.join('');

changelog = title + masterSection + rest;

fs.writeFileSync(changelogPath, changelog, 'utf8');
console.log(`Changelog updated at ${changelogPath}`);

// Write outputs to GITHUB_OUTPUT
fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${newVersion}\n`);
