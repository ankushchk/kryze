import { v2 as cloudinary } from 'cloudinary';

// Configure only if env variables are defined
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/**
 * Uploads a file buffer directly to Cloudinary
 * @param fileBuffer The file buffer to upload
 * @returns The secure URL string or null if Cloudinary is not configured/fails
 */
export const uploadToCloudinary = (fileBuffer: Buffer): Promise<string | null> => {
  return new Promise((resolve) => {
    // If not configured, resolve to null gracefully
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.warn('Cloudinary environment variables are missing. Skipping upload.');
      return resolve(null);
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'receipts' },
      (error, result) => {
        if (error) {
          console.error('Cloudinary Upload Stream Error:', error);
          return resolve(null); // Resolve to null so flow doesn't crash completely
        }
        resolve(result?.secure_url || null);
      }
    );

    uploadStream.end(fileBuffer);
  });
};
