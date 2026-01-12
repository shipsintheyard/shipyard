/**
 * Image upload utilities for token metadata
 * Supports multiple storage providers: IPFS (via Pinata), Arweave, or direct base64
 */

export interface UploadResult {
  url: string;
  provider: 'ipfs' | 'arweave' | 'base64';
}

/**
 * Upload image to IPFS using Pinata
 * You'll need to sign up at https://pinata.cloud and get an API key
 */
export async function uploadToIPFS(file: File): Promise<UploadResult> {
  const PINATA_API_KEY = process.env.NEXT_PUBLIC_PINATA_API_KEY;
  const PINATA_SECRET_KEY = process.env.NEXT_PUBLIC_PINATA_SECRET_KEY;

  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    throw new Error(
      'Pinata API keys not configured. Add NEXT_PUBLIC_PINATA_API_KEY and NEXT_PUBLIC_PINATA_SECRET_KEY to your .env.local file.\n\n' +
      'Sign up at https://pinata.cloud to get your keys.'
    );
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_KEY,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`IPFS upload failed: ${response.statusText}`);
  }

  const data = await response.json();
  const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`;

  return {
    url: ipfsUrl,
    provider: 'ipfs',
  };
}

/**
 * Upload image to Arweave using Bundlr
 * Requires Arweave wallet and AR tokens
 */
export async function uploadToArweave(file: File): Promise<UploadResult> {
  // This is a simplified version - full implementation would use @bundlr-network/client
  throw new Error(
    'Arweave upload not yet implemented.\n\n' +
    'To use Arweave:\n' +
    '1. Install @bundlr-network/client\n' +
    '2. Fund a Bundlr account with AR tokens\n' +
    '3. Implement upload logic\n\n' +
    'For now, use IPFS (Pinata) or base64 encoding.'
  );
}

/**
 * Convert image to base64 data URL
 * Good for testing, but not recommended for production (large URLs)
 */
export async function convertToBase64(file: File): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const base64 = reader.result as string;
      resolve({
        url: base64,
        provider: 'base64',
      });
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Main upload function - tries IPFS first, falls back to base64
 */
export async function uploadTokenImage(file: File): Promise<UploadResult> {
  // Validate file
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image');
  }

  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    throw new Error('Image must be smaller than 5MB');
  }

  try {
    // Try IPFS first if keys are configured
    if (process.env.NEXT_PUBLIC_PINATA_API_KEY) {
      console.log('Uploading to IPFS...');
      return await uploadToIPFS(file);
    } else {
      console.log('IPFS not configured, using base64...');
      console.warn('⚠️ Base64 encoding creates large URLs. Configure Pinata for production use.');
      return await convertToBase64(file);
    }
  } catch (error) {
    console.error('Upload error:', error);
    // Fallback to base64 if IPFS fails
    console.log('IPFS upload failed, falling back to base64...');
    return await convertToBase64(file);
  }
}

/**
 * Create token metadata JSON for Metaplex standard
 */
export interface TokenMetadata {
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  external_url?: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

export async function createTokenMetadata(
  name: string,
  symbol: string,
  description: string,
  imageFile?: File,
  externalUrl?: string
): Promise<TokenMetadata> {
  const metadata: TokenMetadata = {
    name,
    symbol,
    description,
    external_url: externalUrl,
  };

  if (imageFile) {
    const uploadResult = await uploadTokenImage(imageFile);
    metadata.image = uploadResult.url;
  }

  return metadata;
}

/**
 * Upload metadata JSON to IPFS
 */
export async function uploadMetadataToIPFS(metadata: TokenMetadata): Promise<string> {
  const PINATA_API_KEY = process.env.NEXT_PUBLIC_PINATA_API_KEY;
  const PINATA_SECRET_KEY = process.env.NEXT_PUBLIC_PINATA_SECRET_KEY;

  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    // Return base64 encoded JSON as fallback
    const jsonString = JSON.stringify(metadata);
    const base64 = btoa(jsonString);
    return `data:application/json;base64,${base64}`;
  }

  const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_KEY,
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    throw new Error(`Metadata upload failed: ${response.statusText}`);
  }

  const data = await response.json();
  return `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`;
}
