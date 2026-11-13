import { AwsClient } from "aws4fetch";

import { sha256, type BlobStore } from "./storage";

export type R2Options = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Replaced in tests. */
  fetch?: (request: Request) => Promise<Response>;
};

const HASH = /^[0-9a-f]{64}$/;

/**
 * Game files in a Cloudflare R2 bucket, through its S3-compatible API.
 * A file's key is the hash of its bytes, so a file is uploaded at most once
 * and nothing stored is ever overwritten with different contents.
 */
export class R2BlobStore implements BlobStore {
  private readonly client: AwsClient;
  private readonly base: string;
  private readonly send: (request: Request) => Promise<Response>;

  constructor(options: R2Options) {
    this.client = new AwsClient({
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      service: "s3",
      region: "auto",
    });
    this.base = `https://${options.accountId}.r2.cloudflarestorage.com/${options.bucket}`;
    this.send = options.fetch ?? ((request) => fetch(request));
  }

  /** Where a file lives in the bucket. The play domain reads the same keys. */
  static key(hash: string): string {
    return `blobs/${hash.slice(0, 2)}/${hash}`;
  }

  private async request(method: string, hash: string, body?: Uint8Array): Promise<Response> {
    const signed = await this.client.sign(`${this.base}/${R2BlobStore.key(hash)}`, {
      method,
      body: body as BodyInit | undefined,
      headers: body ? { "content-type": "application/octet-stream" } : undefined,
    });
    return this.send(signed);
  }

  async put(bytes: Uint8Array): Promise<string> {
    const hash = sha256(bytes);
    const head = await this.request("HEAD", hash);
    if (head.ok) return hash;
    if (head.status !== 404) throw new Error(`File storage answered ${head.status} checking for ${hash}`);
    const put = await this.request("PUT", hash, bytes);
    if (!put.ok) throw new Error(`File storage answered ${put.status} storing ${hash}`);
    return hash;
  }

  async get(hash: string): Promise<Uint8Array | null> {
    if (!HASH.test(hash)) return null;
    const response = await this.request("GET", hash);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`File storage answered ${response.status} reading ${hash}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    // The key is the hash, so anything else means the stored file is damaged.
    if (sha256(bytes) !== hash) throw new Error(`Stored file ${hash} does not match its hash`);
    return bytes;
  }
}
