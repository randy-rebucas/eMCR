import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { apiRequest } from './api';
import { emitRefresh } from './events';

/**
 * Longest side of the stored picture. It's kept inline on the patient record (a data URI, ≤ 300 KB
 * on the server), so it's made small: a 512 px JPEG at 0.75 is usually 30–60 KB.
 */
const SIZE = 512;
const QUALITY = 0.75;

export type PhotoSource = 'camera' | 'library';

/** No picture came back because camera / photos access was refused. */
export class PhotoPermissionError extends Error {
  constructor(public source: PhotoSource) {
    super(`No ${source} permission`);
  }
}

/**
 * Let the patient take or choose a picture, cropped square, then shrink it to a small JPEG data
 * URI. Null when they cancel. Throws PhotoPermissionError when access is refused.
 */
export async function pickProfilePhoto(source: PhotoSource): Promise<string | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new PhotoPermissionError('camera');
  }
  // The library opens Android's photo picker, which needs no permission; iOS asks on its own.
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;

  let savedUri: string | null = null;
  try {
    const resize = asset.width >= asset.height ? { width: Math.min(SIZE, asset.width) } : { height: Math.min(SIZE, asset.height) };
    const rendered = await ImageManipulator.manipulate(asset.uri).resize(resize).renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: QUALITY, base64: true });
    savedUri = saved.uri;
    if (!saved.base64) return null;
    return `data:image/jpeg;base64,${saved.base64}`;
  } finally {
    // The camera shot / cropped copy and the shrunk JPEG are temp files in the app cache: once the
    // picture is a data URI they are only a stray copy of a face, so they go.
    deleteTempFile(asset.uri);
    if (savedUri) deleteTempFile(savedUri);
  }
}

/** Delete a file the picker or manipulator wrote into this app's cache. Never throws. */
function deleteTempFile(uri: string): void {
  try {
    // Only our own cache files (…/cache/ on Android, …/Library/Caches/ on iOS), never a
    // content:// or ph:// library original.
    if (!uri.startsWith('file://') || !/\/caches?\//i.test(uri)) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Best effort.
  }
}

/**
 * Save (data URI) or remove (null) the picture of whoever is on screen: the signed-in person, or a
 * family member they manage (the api layer sends the active profile). Screens showing the profile
 * refetch.
 */
export async function saveProfilePhoto(image: string | null): Promise<string | null> {
  const result = image
    ? await apiRequest<{ profileImage: string | null }>('/api/patients/me/photo', { method: 'PUT', body: { image } })
    : await apiRequest<{ profileImage: string | null }>('/api/patients/me/photo', { method: 'DELETE' });
  emitRefresh('profile');
  return result?.profileImage ?? null;
}
