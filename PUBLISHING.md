# Publishing new version

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
