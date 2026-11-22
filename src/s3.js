'use strict';

import path from 'node:path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { fromIni } from '@aws-sdk/credential-provider-ini';
import { isS3Url } from './utils.js';

// Clients for whole-object reads (styles, sprites), shared per endpoint, region and profile.
const objectClients = new Map();

/**
 * Parses various S3 URL formats into bucket, key, endpoint, region, and profile.
 * Supports:
 * - AWS S3: s3://bucket-name/path/to/file
 * - S3-compatible with endpoint: s3://endpoint-url/bucket/path/to/file
 * - S3-compatible with endpoint and scheme: s3+http://endpoint-url/bucket/path/to/file
 *   or s3+https://endpoint-url/bucket/path/to/file
 * @param {string} url - The S3 URL to parse.
 * @param {string} [s3UrlFormat] - Optional format override: 'aws' or 'custom'.
 * @returns {object} - An object containing bucket, key, endpoint, region, profile, and requestPayer.
 * @throws {Error} - Throws an error if the URL format is invalid.
 */
export function parseS3Url(url, s3UrlFormat) {
  // Validate s3UrlFormat if provided
  if (s3UrlFormat && s3UrlFormat !== 'aws' && s3UrlFormat !== 'custom') {
    console.warn(
      `Invalid s3UrlFormat: "${s3UrlFormat}". Must be "aws" or "custom". Using auto-detection.`,
    );
    s3UrlFormat = undefined;
  }

  let region = process.env.AWS_REGION || 'us-east-1';
  let profile = null;
  let requestPayer = false;

  // Parse URL parameters
  const [cleanUrl, queryString] = url.split('?');
  if (queryString) {
    const params = new URLSearchParams(queryString);
    // URL parameters override defaults
    profile = params.get('profile') ?? profile;
    region = params.get('region') ?? region;
    s3UrlFormat = s3UrlFormat ?? params.get('s3UrlFormat'); // Config overrides URL

    const payerVal = params.get('requestPayer');
    requestPayer = payerVal === 'true' || payerVal === '1';
  }

  // Helper to build result object
  const buildResult = (endpoint, bucket, key, scheme = 'https') => ({
    endpoint: endpoint ? `${scheme}://${endpoint}` : null,
    bucket,
    key,
    region,
    profile,
    requestPayer,
  });

  // s3+http:// and s3+https:// name the endpoint's scheme, so they always
  // carry an endpoint and s3UrlFormat does not apply.
  const schemeMatch = cleanUrl.match(
    /^s3\+(https?):\/\/([^/]+)\/([^/]+)\/(.+)$/i,
  );
  if (schemeMatch) {
    return buildResult(
      schemeMatch[2],
      schemeMatch[3],
      schemeMatch[4],
      schemeMatch[1].toLowerCase(),
    );
  }

  // Define patterns based on format
  const patterns = {
    customWithDot: /^s3:\/\/([^/]*\.[^/]+)\/([^/]+)\/(.+)$/, // Auto-detect: requires dot
    customForced: /^s3:\/\/([^/]+)\/([^/]+)\/(.+)$/, // Explicit: no dot required
    aws: /^s3:\/\/([^/]+)\/(.+)$/,
  };

  // Match based on s3UrlFormat or auto-detect
  let match;

  if (s3UrlFormat === 'custom') {
    match = cleanUrl.match(patterns.customForced);
    if (match) return buildResult(match[1], match[2], match[3]);
  } else if (s3UrlFormat === 'aws') {
    match = cleanUrl.match(patterns.aws);
    if (match) return buildResult(null, match[1], match[2]);
  } else {
    // Auto-detection: try custom (with dot) first, then AWS
    match = cleanUrl.match(patterns.customWithDot);
    if (match) return buildResult(match[1], match[2], match[3]);

    match = cleanUrl.match(patterns.aws);
    if (match) return buildResult(null, match[1], match[2]);
  }

  throw new Error(
    `Invalid S3 URL format: ${url}\n` +
      `Expected formats:\n` +
      `  AWS S3: s3://bucket-name/path/to/file.pmtiles\n` +
      `  Custom endpoint: s3://endpoint.com/bucket/path/to/file.pmtiles\n` +
      `  Custom endpoint and scheme: s3+http://endpoint:port/bucket/path/to/file.pmtiles\n` +
      `Use s3UrlFormat parameter to override auto-detection if needed.`,
  );
}

/**
 * Creates an S3 client with optional custom endpoint and AWS profile support.
 * @param {string|null} endpoint - The custom endpoint URL, or null for default AWS S3.
 * @param {string} region - The AWS region.
 * @param {string} [profile] - Optional AWS credential profile name.
 * @param {number} [verbose] - Verbosity level (1-3). 1=important, 2=detailed, 3=debug/all requests.
 * @returns {S3Client} - Configured S3Client instance.
 */
export function createS3Client(endpoint, region, profile, verbose) {
  const config = {
    region: region,
    requestHandler: {
      connectionTimeout: 5000,
      socketTimeout: 5000,
    },
    forcePathStyle: !!endpoint,
  };

  if (endpoint) {
    config.endpoint = endpoint;
    if (verbose >= 2) {
      console.log(`Using custom S3 endpoint: ${endpoint}`);
    }
  }

  if (profile) {
    config.credentials = fromIni({ profile });
    if (verbose >= 2) {
      console.log(`Using AWS profile: ${profile}`);
    }
  }

  return new S3Client(config);
}

/**
 * Resolves an S3 URL and its configuration into the settings for a request.
 * Precedence: config > URL parameters > defaults.
 * @param {string} url - The S3 URL.
 * @param {object} [config] - Optional settings from the configuration file.
 * @param {string} [config.s3Profile] - AWS credential profile name.
 * @param {boolean} [config.requestPayer] - Flag for requester pays buckets.
 * @param {string} [config.s3Region] - AWS region.
 * @param {string} [config.s3UrlFormat] - S3 URL format: 'aws' or 'custom'.
 * @param {number} [config.verbose] - Verbosity level (1-3).
 * @returns {object} - An object containing bucket, key, endpoint, region, profile, and requestPayer.
 */
export function resolveS3Url(url, config = {}) {
  const { s3Profile, requestPayer, s3Region, s3UrlFormat, verbose } = config;
  const parsed = parseS3Url(url, s3UrlFormat);

  // Using || for strings (empty string = not set)
  // Using ?? for booleans (false is valid value)
  const resolved = {
    bucket: parsed.bucket,
    key: parsed.key,
    endpoint: parsed.endpoint,
    profile: s3Profile || parsed.profile,
    requestPayer: requestPayer ?? parsed.requestPayer,
    region: s3Region || parsed.region,
  };

  // Log precedence decisions for debugging
  if (verbose >= 3) {
    console.log(`S3 config precedence for ${url}:`);
    console.log(
      `  Profile: ${s3Profile ? 'config' : parsed.profile ? 'url' : 'default'} = ${resolved.profile || 'none'}`,
    );
    console.log(
      `  Region: ${s3Region ? 'config' : parsed.region !== (process.env.AWS_REGION || 'us-east-1') ? 'url' : 'env/default'} = ${resolved.region}`,
    );
    console.log(
      `  RequestPayer: ${requestPayer !== undefined ? 'config' : parsed.requestPayer ? 'url' : 'default'} = ${resolved.requestPayer}`,
    );
  }

  return resolved;
}

/**
 * Turns an S3 SDK error into an error that names the object.
 * @param {Error} error - The error thrown by the S3 client.
 * @param {string} bucket - The bucket that was requested.
 * @param {string} key - The key that was requested.
 * @param {string} [what] - What the object is, for the not-found message.
 * @returns {Error} - The error to throw.
 */
export function describeS3Error(error, bucket, key, what = 'S3 object') {
  if (error.name === 'NoSuchKey') {
    return new Error(`${what} not found: ${bucket}/${key}`, {
      cause: error,
    });
  }

  if (error.name === 'AccessDenied') {
    return new Error(
      `Access denied: ${bucket}/${key}. Check credentials and bucket permissions.`,
      { cause: error },
    );
  }

  if (error.name === 'NoSuchBucket') {
    return new Error(
      `Bucket not found: ${bucket}. Check bucket name and endpoint.`,
      { cause: error },
    );
  }

  console.error(`S3 error for ${bucket}/${key}:`, error.message);
  return error;
}

/**
 * Picks the S3 settings out of a config item (a data source or a style).
 * @param {object} item - The config item.
 * @param {number} [verbose] - Verbosity level (1-3).
 * @returns {object} - Settings for resolveS3Url() and getS3Object().
 */
export function s3ConfigFrom(item, verbose) {
  return {
    s3Profile: item?.s3Profile,
    requestPayer: item?.requestPayer,
    s3Region: item?.s3Region,
    s3UrlFormat: item?.s3UrlFormat,
    verbose,
  };
}

/**
 * Reads a whole object from S3.
 * @param {string} url - The S3 URL of the object.
 * @param {object} [config] - S3 settings from the config, see resolveS3Url().
 * @returns {Promise<{data: Buffer, etag: string, lastModified: Date}>} - The object's contents.
 * @throws {Error} - Throws on S3 errors like NoSuchKey, AccessDenied, NoSuchBucket.
 */
export async function getS3Object(url, config = {}) {
  const resolved = resolveS3Url(url, config);
  const clientKey = JSON.stringify([
    resolved.endpoint,
    resolved.region,
    resolved.profile,
  ]);
  let client = objectClients.get(clientKey);
  if (!client) {
    client = createS3Client(
      resolved.endpoint,
      resolved.region,
      resolved.profile,
      config.verbose,
    );
    objectClients.set(clientKey, client);
  }

  const commandParams = { Bucket: resolved.bucket, Key: resolved.key };
  if (resolved.requestPayer) {
    commandParams.RequestPayer = 'requester';
  }

  try {
    const response = await client.send(new GetObjectCommand(commandParams));
    const arr = await response.Body.transformToByteArray();
    return {
      data: Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength),
      etag: response.ETag,
      lastModified: response.LastModified,
    };
  } catch (error) {
    throw describeS3Error(error, resolved.bucket, resolved.key);
  }
}

/**
 * Splits a URL into the part before its query string and the query string.
 * @param {string} url - The URL.
 * @returns {[string, string]} - The URL without its query, and the query including '?' (or '').
 */
function splitQuery(url) {
  const queryPos = url.indexOf('?');
  return queryPos < 0
    ? [url, '']
    : [url.slice(0, queryPos), url.slice(queryPos)];
}

/**
 * Inserts a suffix at the end of an S3 URL's key, before any query string.
 * @param {string} url - The S3 URL.
 * @param {string} suffix - The text to add to the key, e.g. '@2x.png'.
 * @returns {string} - The new URL.
 */
export function appendToS3Key(url, suffix) {
  const [base, query] = splitQuery(url);
  return base + suffix + query;
}

/**
 * Works out whether a style's sprite lives in S3, and where.
 *
 * A sprite is read from S3 when its URL is itself an S3 URL, or when the
 * style was loaded from S3 and the sprite uses {styleJsonFolder}, which then
 * means the folder holding the style in the bucket. The style's query string
 * (profile, region, ...) carries over to a sprite found next to it.
 * @param {string} spriteUrl - The sprite URL from the style.
 * @param {string} style - The style's location from the config (a path or an S3 URL).
 * @returns {string|null} - The sprite's S3 URL without scale or extension, or null for a local or HTTP sprite.
 */
export function resolveS3SpriteUrl(spriteUrl, style) {
  if (typeof spriteUrl !== 'string') {
    return null;
  }
  const styleIsS3 = isS3Url(style);
  const besideS3Style = styleIsS3 && spriteUrl.includes('{styleJsonFolder}');
  if (!isS3Url(spriteUrl) && !besideS3Style) {
    return null;
  }

  const [styleBase, styleQuery] = styleIsS3 ? splitQuery(style) : [style, ''];
  const styleName = path.posix.basename(
    String(styleBase).replace(/\\/g, '/'),
    '.json',
  );
  let url = spriteUrl.replace('{style}', styleName);
  if (besideS3Style) {
    const styleFolder = styleBase.slice(0, styleBase.lastIndexOf('/'));
    url = url.replace('{styleJsonFolder}', styleFolder);
    if (!url.includes('?')) {
      url += styleQuery;
    }
  }
  return url;
}
