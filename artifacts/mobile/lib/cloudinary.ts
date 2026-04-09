/**
 * cloudinary.ts — Attachment upload service for Arabian Fal Legal Platform
 *
 * Uses Cloudinary unsigned upload preset so no API secret is ever present in
 * the mobile bundle. All uploads go directly from the device to Cloudinary.
 *
 * Folder strategy:
 *   afal/requests/{requestId}/...   — attachments on new requests
 *   afal/messages/{requestId}/...   — attachments on conversation messages
 *   afal/user/{uid}/...             — other user-attached files
 *
 * Future upgrade path:
 *   When Cloudflare Worker signed uploads are implemented, swap the
 *   `uploadToCloudinary` call below with a worker-signed request.
 *   The `CloudinaryUploadResult` interface and all Firestore metadata fields
 *   remain unchanged so no data-model migration is needed.
 */

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "";

if (!CLOUD_NAME || !UPLOAD_PRESET) {
  console.warn(
    "[Cloudinary] EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME or EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET is not set."
  );
}

export const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;

/**
 * File types allowed for upload.
 * Matches the DocumentPicker and ImagePicker MIME types used in AttachmentPicker.
 */
export const ALLOWED_MIME_TYPES: Record<string, boolean> = {
  "image/jpeg": true,
  "image/jpg": true,
  "image/png": true,
  "image/gif": true,
  "image/webp": true,
  "application/pdf": true,
  "application/msword": true,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
};

export function isMimeTypeAllowed(mimeType: string): boolean {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  return !!ALLOWED_MIME_TYPES[base];
}

export function getResourceType(mimeType: string): "image" | "raw" {
  if (mimeType.startsWith("image/")) return "image";
  return "raw"; // PDFs and Word docs are "raw" in Cloudinary
}

export function getFileIcon(mimeType: string): "image" | "file-doc" {
  if (mimeType.startsWith("image/")) return "image";
  return "file-doc";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface CloudinaryUploadResult {
  /** Permanent CDN URL returned by Cloudinary */
  fileUrl: string;
  /** Cloudinary public_id — used to delete or transform later */
  publicId: string;
  /** Original file name as picked by the user */
  fileName: string;
  /** MIME type of the uploaded file */
  fileType: string;
  /** File size in bytes */
  size: number;
  /** Cloudinary resource_type: "image" | "raw" */
  resourceType: string;
  /** Cloudinary folder path (e.g. afal/requests/abc123) */
  folder: string;
}

export interface UploadOptions {
  /**
   * Cloudinary folder — determines where the file is stored.
   * Convention:
   *   "afal/requests/{requestId}"  for request-level attachments
   *   "afal/messages/{requestId}"  for in-thread message attachments
   */
  folder: string;
  /** Optional display name override. Defaults to the file's original name. */
  displayName?: string;
  /** Progress callback — value between 0 and 1 */
  onProgress?: (progress: number) => void;
}

/**
 * Upload a file to Cloudinary using unsigned preset.
 *
 * FUTURE UPGRADE: To switch to signed uploads via a Cloudflare Worker,
 * replace this function's FormData construction with a call to your Worker
 * endpoint that returns a signed signature + timestamp, then include those
 * in the FormData instead of `upload_preset`. The return type is unchanged.
 */
export async function uploadToCloudinary(
  uri: string,
  fileName: string,
  mimeType: string,
  options: UploadOptions
): Promise<CloudinaryUploadResult> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary is not configured. Please set EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET."
    );
  }

  const normalizedMime = mimeType.split(";")[0].trim().toLowerCase();
  if (!isMimeTypeAllowed(normalizedMime)) {
    throw new Error(
      `File type "${normalizedMime}" is not allowed. Supported: images, PDF, Word documents.`
    );
  }

  const resourceType = getResourceType(normalizedMime);

  // Build a clean public_id using ONLY timestamp + sanitized filename (NO folder prefix).
  // We also send "folder" as a separate FormData field.
  // Cloudinary combines them internally as: {folder}/{public_id}
  // If the folder is also embedded in public_id, Cloudinary prepends it AGAIN
  // → duplicated path like "afal/requests/X/afal/requests/X/..." in secure_url.
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const timestamp = Date.now();
  const publicIdBase = `${timestamp}_${safeName.replace(/\.[^.]+$/, "")}`;

  const formData = new FormData();

  // On React Native / Expo we append the file as a blob-like object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formData.append("file", { uri, name: fileName, type: normalizedMime } as any);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", options.folder);
  formData.append("public_id", publicIdBase);
  formData.append("resource_type", resourceType);

  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;

  const response = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Cloudinary upload failed (${response.status}): ${errBody}`);
  }

  const data = await response.json() as {
    secure_url: string;
    public_id: string;
    bytes: number;
    resource_type: string;
    folder: string;
  };

  return {
    fileUrl: data.secure_url,
    publicId: data.public_id,
    fileName,
    fileType: normalizedMime,
    size: data.bytes,
    resourceType: data.resource_type,
    folder: options.folder,
  };
}
