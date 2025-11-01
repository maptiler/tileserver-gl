import fs from 'node:fs';
import { PMTiles, FetchSource, EtagMismatch } from 'pmtiles';
import { isValidHttpUrl } from './utils.js';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

// Initialize S3 client (will use environment variables or IAM role)
const s3Client = new S3Client({
  // Region will default to AWS_REGION env var or instance metadata
  requestHandler: {
    connectionTimeout: 5000,
    socketTimeout: 5000,
  },
});

/**
 * S3 Source for PMTiles
 * Supports s3://bucket-name/path/to/file.pmtiles URLs
 */
class S3Source {
  constructor(s3Url) {
    // Parse s3://bucket/key format
    const match = s3Url.match(/^s3:\/\/([^\/]+)\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid S3 URL format: ${s3Url}. Expected s3://bucket/key`);
    }
    this.bucket = match[1];
    this.key = match[2];
    this.url = s3Url;
  }

  getKey() {
    return this.url;
  }

  async getBytes(offset, length, signal, etag) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.key,
        Range: `bytes=${offset}-${offset + length - 1}`,
        IfMatch: etag,
        // Optional: RequestPayer: 'requester', // Uncomment if using requester-pays buckets
      });

      const response = await s3Client.send(command, {
        abortSignal: signal,
      });

      const arr = await response.Body.transformToByteArray();
      
      if (!arr) {
        throw new Error('Failed to read S3 response body');
      }

      return {
        data: arr.buffer,
        etag: response.ETag,
        expires: response.Expires?.toISOString(),
        cacheControl: response.CacheControl,
      };
    } catch (error) {
      // Handle AWS SDK errors
      if (error.name === 'PreconditionFailed') {
        throw new EtagMismatch();
      }
      
      if (error.name === 'NoSuchKey') {
        throw new Error(`PMTiles file not found in S3: ${this.bucket}/${this.key}`);
      }
      
      if (error.name === 'AccessDenied') {
        throw new Error(`Access denied to S3 bucket: ${this.bucket}/${this.key}. Check IAM permissions.`);
      }
      
      throw error;
    }
  }
}

class PMTilesFileSource {
  constructor(fd) {
    this.fd = fd;
  }
  getKey() {
    return this.fd;
  }
  async getBytes(offset, length) {
    const buffer = Buffer.alloc(length);
    await readFileBytes(this.fd, buffer, offset);
    const ab = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    return { data: ab };
  }
}

/**
 * Read bytes from file descriptor
 */
async function readFileBytes(fd, buffer, offset) {
  return new Promise((resolve, reject) => {
    fs.read(fd, buffer, 0, buffer.length, offset, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

/**
 * Open PMTiles from local file, HTTP URL, or S3 URL
 * @param {string} filePath - Local path, http(s):// URL, or s3:// URL
 */
export function openPMtiles(filePath) {
  let pmtiles = undefined;

  // Check for S3 URL
  if (filePath.startsWith('s3://')) {
    console.log(`Opening PMTiles from S3: ${filePath}`);
    const source = new S3Source(filePath);
    pmtiles = new PMTiles(source);
  }
  // Check for HTTP/HTTPS URL
  else if (isValidHttpUrl(filePath)) {
    console.log(`Opening PMTiles from HTTP: ${filePath}`);
    const source = new FetchSource(filePath);
    pmtiles = new PMTiles(source);
  }
  // Local file
  else {
    console.log(`Opening PMTiles from local file: ${filePath}`);
    const fd = fs.openSync(filePath, 'r');
    const source = new PMTilesFileSource(fd);
    pmtiles = new PMTiles(source);
  }
  
  return pmtiles;
}

/**
 * Get PMTiles metadata
 */
export async function getPMtilesInfo(pmtiles, inputFile) {
  let header;
  try {
    header = await pmtiles.getHeader();
  } catch (error) {
    const errorMessage = `${error.message} for file: ${inputFile}`;
    throw new Error(errorMessage);
  }
  const metadata = await pmtiles.getMetadata();

  // Add missing metadata from header
  metadata['format'] = getPmtilesTileType(header.tileType).type;
  metadata['minzoom'] = header.minZoom;
  metadata['maxzoom'] = header.maxZoom;

  if (header.minLon && header.minLat && header.maxLon && header.maxLat) {
    metadata['bounds'] = [
      header.minLon,
      header.minLat,
      header.maxLon,
      header.maxLat,
    ];
  } else {
    metadata['bounds'] = [-180, -85.05112877980659, 180, 85.0511287798066];
  }

  if (header.centerZoom) {
    metadata['center'] = [
      header.centerLon,
      header.centerLat,
      header.centerZoom,
    ];
  } else {
    metadata['center'] = [
      header.centerLon,
      header.centerLat,
      parseInt(metadata['maxzoom']) / 2,
    ];
  }

  return metadata;
}

/**
 * Get a tile from PMTiles with retry logic
 */
export async function getPMtilesTile(pmtiles, z, x, y, maxRetries = 3) {
  const header = await pmtiles.getHeader();
  const tileType = getPmtilesTileType(header.tileType);
  
  // Retry logic with exponential backoff
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      let zxyTile = await pmtiles.getZxy(z, x, y);
      
      if (zxyTile && zxyTile.data) {
        zxyTile = Buffer.from(zxyTile.data);
      } else {
        zxyTile = undefined;
      }
      
      return { data: zxyTile, header: tileType.header };
    } catch (error) {
      // If it's a 429 rate limit error and we have retries left
      if (error.message && error.message.includes('429') && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.warn(`Rate limited for tile ${z}/${x}/${y}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If it's another HTTP error, log and return undefined
      if (error.message && error.message.includes('Bad response code:')) {
        console.error(`HTTP error for tile ${z}/${x}/${y}: ${error.message}`);
        return { data: undefined, header: tileType.header };
      }
      
      // For other errors, throw
      throw error;
    }
  }
  
  // If we exhausted all retries
  console.error(`Failed to fetch tile ${z}/${x}/${y} after ${maxRetries} attempts`);
  return { data: undefined, header: tileType.header };
}

/**
 * Get PMTiles tile type
 */
function getPmtilesTileType(typenum) {
  let head = {};
  let tileType;
  switch (typenum) {
    case 0:
      tileType = 'Unknown';
      break;
    case 1:
      tileType = 'pbf';
      head['Content-Type'] = 'application/x-protobuf';
      break;
    case 2:
      tileType = 'png';
      head['Content-Type'] = 'image/png';
      break;
    case 3:
      tileType = 'jpeg';
      head['Content-Type'] = 'image/jpeg';
      break;
    case 4:
      tileType = 'webp';
      head['Content-Type'] = 'image/webp';
      break;
    case 5:
      tileType = 'avif';
      head['Content-Type'] = 'image/avif';
      break;
  }
  return { type: tileType, header: head };
}
