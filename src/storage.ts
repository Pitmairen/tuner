import { File, Paths } from 'expo-file-system';

/** Reads a JSON file from the app's documents, or null if missing or unreadable. */
export function readJson(name: string): unknown {
  try {
    const file = new File(Paths.document, name);
    return file.exists ? JSON.parse(file.textSync()) : null;
  } catch (error) {
    console.warn(`Could not read ${name}`, error);
    return null;
  }
}

export function writeJson(name: string, value: unknown) {
  try {
    new File(Paths.document, name).write(JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not write ${name}`, error);
  }
}
