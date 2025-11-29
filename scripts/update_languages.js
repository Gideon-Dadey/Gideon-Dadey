// Node script that fetches repo language stats, finds the top language,
// and updates README.md between markers <!--TOP_LANGUAGE-->...<!--/TOP_LANGUAGE-->.
// Falls back to creating/updating languages.json if README marker not present.

const { Octokit } = require("@octokit/rest");

function badgeForLanguage(lang) {
  const label = "Most Used";
  const message = encodeURIComponent(lang);
  const color = "3178C6"; // generic color (change if you want language-specific colors)
  const style = "for-the-badge";
  return `<img src="https://img.shields.io/static/v1?label=${encodeURIComponent(label)}&message=${message}&color=${color}&style=${style}" alt="Primary Language" />`;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repoFull = process.env.GITHUB_REPOSITORY; // owner/repo
  if (!token || !repoFull) {
    console.error("GITHUB_TOKEN and GITHUB_REPOSITORY must be set.");
    process.exit(1);
  }

  const [owner, repo] = repoFull.split("/");
  const octokit = new Octokit({ auth: token });

  // 1) get languages
  const { data: languages } = await octokit.repos.listLanguages({ owner, repo });
  const entries = Object.entries(languages);
  if (entries.length === 0) {
    console.log("No languages detected for repository.");
  }
  const topLang = entries.sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";
  console.log("Top language:", topLang);

  // 2) try to update README.md between markers
  const readmePath = "README.md";
  const startMarker = "<!--TOP_LANGUAGE-->";
  const endMarker = "<!--/TOP_LANGUAGE-->";
  try {
    const readmeResp = await octokit.repos.getContent({ owner, repo, path: readmePath });
    const sha = readmeResp.data.sha;
    const contentEncoded = readmeResp.data.content;
    const content = Buffer.from(contentEncoded, "base64").toString("utf8");

    if (content.includes(startMarker) && content.includes(endMarker)) {
      const badge = `\n${badgeForLanguage(topLang)}\n`;
      const newContent = content.replace(
        new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, "m"),
        `${startMarker}${badge}${endMarker}`
      );

      if (newContent === content) {
        console.log("README already up-to-date, no commit necessary.");
        return;
      }

      const updatedEncoded = Buffer.from(newContent, "utf8").toString("base64");
      const message = `chore: update top language to ${topLang} (automated)`;

      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: readmePath,
        message,
        content: updatedEncoded,
        sha,
      });

      console.log("README.md updated with new top language:", topLang);
      return;
    } else {
      console.log("README does not contain markers. Falling back to languages.json update.");
    }
  } catch (err) {
    if (err.status === 404) {
      console.log("README.md not found. Will create languages.json instead.");
    } else {
      console.error("Error reading README.md:", err.message);
      // continue to fallback
    }
  }

  // 3) fallback: update or create languages.json with full languages object and topLanguage field
  const jsonPath = "languages.json";
  const jsonContentObj = {
    topLanguage: topLang,
    languages,
    updatedAt: new Date().toISOString(),
  };
  const jsonContentStr = JSON.stringify(jsonContentObj, null, 2);
  const jsonEncoded = Buffer.from(jsonContentStr, "utf8").toString("base64");
  const message = `chore: update languages.json (top: ${topLang}) (automated)`;

  try {
    const jsonResp = await octokit.repos.getContent({ owner, repo, path: jsonPath });
    const sha = jsonResp.data.sha;
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: jsonPath,
      message,
      content: jsonEncoded,
      sha,
    });
    console.log("Updated languages.json");
  } catch (err) {
    if (err.status === 404) {
      // create
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: jsonPath,
        message,
        content: jsonEncoded,
      });
      console.log("Created languages.json");
    } else {
      console.error("Error updating/creating languages.json:", err.message);
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});
