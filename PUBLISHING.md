# Publishing new version with github workflow

1.) Change the version number in package.json. Run the following command in the package root directory, replacing <update_type> with one of the semantic versioning release types (prerelease, prepatch, preminor, premajor, patch, minor, major):
npm version <update_type> --preid pre --no-git-tag-version

--preid specifies which suffix to use in the release such as pre, next, beta, rc, etc.

prepatch, preminor, and premajor start a new series of pre-releases while bumping the patch, minor, or major version. E.g. premajor with --preid pre would do a prerelease for a new major using the -pre suffix (i.e. it would be a new major with -pre.0)

You can use prerelease to bump the version for a new pre-release version. E.g. you could run npm version prerelease --preid pre --no-git-tag-version to go from -pre.0 to -pre.1.

For regular versions, you can use patch, minor, or major. E.g. npm version major --no-git-tag-version.

2.) Update the changelog, which can be found in CHANGELOG.md. The heading must match ## <VERSION> exactly, or it will not be picked up. For example, for version 5.0.0:
```## 5.0.0```

3.) Commit and push the changes.

4.) Run the 'Build, Test, Release' github workflow. The workflow will create a NPM, Docker, and Github release and Tag.

# Publishing new version manually

- Update version in `package.json`
- `git tag vx.x.x`
- `git push --tags`
- `docker buildx build --platform linux/amd64 -t maptiler/tileserver-gl:latest -t maptiler/tileserver-gl:[version] .`
- `docker push maptiler/tileserver-gl --all-tags`
- `npm publish --access public` or `node publish.js` 
- `node publish.js --no-publish`
- `cd light`
- `docker buildx build --platform linux/amd64 -t maptiler/tileserver-gl-light:latest -t maptiler/tileserver-gl-light:[version] .`
- `docker push maptiler/tileserver-gl-light --all-tags`
- `npm publish --access public`
