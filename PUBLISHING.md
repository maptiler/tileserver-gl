# Publishing a New Version

This document outlines the process for publishing new versions of this project. We use a GitHub workflow for automated releases, but also provide manual steps for specific situations.

## Automated Publishing via GitHub Workflow (Recommended)

This is the preferred method for publishing new versions. It automates the entire process, including version bumping, tagging, building, and publishing.

1.  **Prepare the Release:**

    *   **Choose the Version Increment:** Determine the appropriate semantic versioning increment (prerelease, prepatch, preminor, premajor, patch, minor, major).

    *   **Update `package.json`:** Use the `npm version` command to bump the version number. This command also supports creating pre-release versions using the `--preid pre` flag.

        ```bash
        # Example: Increment to a new patch version
        npm version patch --no-git-tag-version

        # Example: Increment to a new minor version
        npm version minor --no-git-tag-version

        # Example: Increment to a new major version
        npm version major --no-git-tag-version

        # Example: Create a pre-release (e.g., -pre.0) version
        npm version prepatch --preid pre --no-git-tag-version
        # OR
        npm version preminor --preid pre --no-git-tag-version
        # OR
        npm version premajor --preid pre --no-git-tag-version

        # Example: Increment an existing pre-release version (e.g., -pre.0 to -pre.1)
        npm version prerelease --preid pre --no-git-tag-version
        ```

        *   `--no-git-tag-version`: This prevents `npm version` from automatically creating a git tag, as the GitHub workflow will handle this later.
        *   `--preid pre`: Specifies that "pre" is the pre-release identifier.

    *   **Update the Changelog (`CHANGELOG.md`):** Add a new section for the release. The heading *must* exactly match the format `## <VERSION>`, where `<VERSION>` is the full version number from `package.json`. Describe the changes included in the release.

        ```markdown
        ## 1.2.3
        *   Added new feature X.
        ```

2.  **Commit and Push:** Commit the changes to `package.json`, `package-lock.json` and `CHANGELOG.md` to a the `master` branch. Create a pull request (PR) for review. If you are an administrator, you may push directly, but a PR is generally recommended for code review.

3.  **Run the GitHub Workflow:** Once the PR is merged (or changes pushed directly), trigger the "Build, Test, Release" GitHub workflow. This workflow is responsible for:

    *   Building the project.
    *   Running tests.
    *   Creating an NPM package.
    *   Building and pushing Docker images.
    *   Creating a GitHub Release.
    *   Creating a Git tag for the release.

## Manual Publishing (For Special Cases)

Use the following steps *only* when the automated workflow is not suitable (e.g., for debugging, specific environment needs).

1.  **Update Version in `package.json`:** Modify the `version` field in `package.json` to the desired version number.

2.  **Create and Push Git Tag:**

    ```bash
    git tag vX.X.X  # Replace X.X.X with the version number
    git push origin --tags
    ```

3.  **NPM Publish Options (Choose ONE):**

    *   **Option A: Publish only the full `tileserver-gl` version:**

        ```bash
        npm publish --access public
        ```

    *   **Option B: Build and Publish both `tileserver-gl` and `tileserver-gl-light` using `publish.js`:**

        ```bash
        # This script builds the light version and publishes both tileserver-gl and tileserver-gl-light to NPM.
        node publish.js
        ```

    *   **Option C: Build only the `tileserver-gl-light` version (no publish):**

        ```bash
        # This script ONLY builds the light version (e.g., for local testing or Docker image creation) without publishing.
        node publish.js --no-publish
        ```

4.  **Build and Push Docker Images:**

    ```bash
    # Build the main image
    docker buildx build --platform linux/amd64 -t maptiler/tileserver-gl:latest -t maptiler/tileserver-gl:X.X.X .  # Replace X.X.X
    docker push maptiler/tileserver-gl --all-tags

    # Build the light image
    cd light
    docker buildx build --platform linux/amd64 -t maptiler/tileserver-gl-light:latest -t maptiler/tileserver-gl-light:X.X.X .  # Replace X.X.X
    docker push maptiler/tileserver-gl-light --all-tags
    cd ..  # Return to the project root
    ```
    * Make sure you are logged into the docker registry before pushing. `docker login`

**Important Considerations for Manual Publishing:**

*   **Consistency:** Ensure the version number in `package.json`, the Git tag, and the Docker image tags are identical.
*   **Credentials:** Verify that you have the necessary permissions to push Docker images and publish to NPM.
*   **Cleanliness:** Before building Docker images, ensure your working directory is clean to avoid including unwanted files in the image.
*   **Error Handling:** Manually publishing is more prone to errors. Double-check each step to avoid issues.
