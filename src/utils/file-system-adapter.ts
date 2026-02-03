// utils/file-system-adapter.ts
// Local folder persistence using File System Access API

// Define types for File System Access API
type FileSystemHandleKind = 'file' | 'directory';

interface FileSystemHandle {
  readonly kind: FileSystemHandleKind;
  readonly name: string;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>;
  [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]>;
  values(): AsyncIterableIterator<FileSystemHandle>;
  keys(): AsyncIterableIterator<string>;
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

interface FileSystemFileHandle extends FileSystemHandle {
  createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
  getFile(): Promise<File>;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
  close(): Promise<void>;
}

// Extend Window interface to include File System Access API methods
declare global {
  interface Window {
    showDirectoryPicker?: (options?: any) => Promise<FileSystemDirectoryHandle>;
  }
}

interface DocumentData {
  text: string;
  timestamp: Date;
  fileName: string;
  fileType: string;
}

interface CaseFolderState {
  userInput: string;
  jurisdiction: string;
  result: any;
  documents: DocumentData[];
  caseLedger: any[];
}

export class LocalFolderManager {
  private directoryHandle: FileSystemDirectoryHandle | null = null;
  private fileName: string = 'lawsage_case';

  async authorizeDirectory(): Promise<boolean> {
    try {
      if (!window.showDirectoryPicker) {
        console.warn('File System Access API not supported in this browser');
        return false;
      }

      this.directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'desktop'
      });

      return true;
    } catch (error: any) {
      console.error('Error authorizing directory:', error);
      return false;
    }
  }

  async saveCaseFolder(state: CaseFolderState): Promise<boolean> {
    try {
      if (!this.directoryHandle) {
        console.warn('No directory handle available');
        return false;
      }

      const timestamp = new Date().toISOString();
      const fileName = `${this.fileName}_${timestamp.replace(/[:.]/g, '_')}.json`;

      try {
        const fileHandle = await this.directoryHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(state, null, 2));
        await writable.close();
        return true;
      } catch (error: any) {
        console.error('Error writing to file:', error);
        return false;
      }
    } catch (error: any) {
      console.error('Error saving case folder:', error);
      return false;
    }
  }

  async loadCaseFolder(): Promise<CaseFolderState | null> {
    try {
      if (!this.directoryHandle) {
        console.warn('No directory handle available');
        return null;
      }

      for await (const entry of this.directoryHandle.values()) {
        if (entry.kind === 'file' && entry.name.startsWith(this.fileName)) {
          const fileHandle = entry as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          const content = await file.text();
          return JSON.parse(content);
        }
      }

      return null;
    } catch (error: any) {
      console.error('Error loading case folder:', error);
      return null;
    }
  }

  async exportDocument(text: string, fileName: string): Promise<boolean> {
    try {
      if (!this.directoryHandle) {
        console.warn('No directory handle available');
        return false;
      }

      try {
        const fileHandle = await this.directoryHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(text);
        await writable.close();
        return true;
      } catch (error: any) {
        console.error('Error exporting document:', error);
        return false;
      }
    } catch (error: any) {
      console.error('Error in export document:', error);
      return false;
    }
  }

  async exportAllDocuments(texts: Record<string, string>): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [fileName, text] of Object.entries(texts)) {
      results[fileName] = await this.exportDocument(text, fileName);
    }

    return results;
  }

  async getRecentCases(): Promise<CaseFolderState[]> {
    try {
      if (!this.directoryHandle) {
        return [];
      }

      const cases: CaseFolderState[] = [];

      for await (const entry of this.directoryHandle.values()) {
        if (entry.kind === 'file' && entry.name.startsWith(this.fileName)) {
          try {
            const fileHandle = entry as FileSystemFileHandle;
            const file = await fileHandle.getFile();
            const content = await file.text();
            const caseData = JSON.parse(content);
            cases.push(caseData);
          } catch (error: any) {
            console.error('Error reading case file:', error);
          }
        }
      }

      return cases;
    } catch (error: any) {
      console.error('Error getting recent cases:', error);
      return [];
    }
  }

  async saveOCRResult(imageFileName: string, extractedText: string): Promise<boolean> {
    try {
      if (!this.directoryHandle) {
        console.warn('No directory handle available');
        return false;
      }

      const baseName = imageFileName.replace(/\.[^/.]+$/, '');
      const ocrFileName = `${baseName}_extracted.txt`;

      return await this.exportDocument(extractedText, ocrFileName);
    } catch (error: any) {
      console.error('Error saving OCR result:', error);
      return false;
    }
  }

  async getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
    return this.directoryHandle;
  }

  async createSubdirectory(name: string): Promise<FileSystemDirectoryHandle | null> {
    try {
      if (!this.directoryHandle) {
        console.warn('No directory handle available');
        return null;
      }

      const subdirectoryHandle = await this.directoryHandle.getDirectoryHandle(name, { create: true });
      return subdirectoryHandle;
    } catch (error: any) {
      console.error('Error creating subdirectory:', error);
      return null;
    }
  }

  async saveFileToSubdirectory(
    subdirectoryName: string,
    fileName: string,
    data: string | Blob
  ): Promise<boolean> {
    try {
      const subdirectory = await this.createSubdirectory(subdirectoryName);
      if (!subdirectory) {
        return false;
      }

      try {
        const fileHandle = await subdirectory.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
        return true;
      } catch (error: any) {
        console.error('Error saving file to subdirectory:', error);
        return false;
      }
    } catch (error: any) {
      console.error('Error in save file to subdirectory:', error);
      return false;
    }
  }
}

// Singleton instance
let localFolderManagerInstance: LocalFolderManager | null = null;

export function getLocalFolderManager(): LocalFolderManager {
  if (!localFolderManagerInstance) {
    localFolderManagerInstance = new LocalFolderManager();
  }
  return localFolderManagerInstance;
}

export function resetLocalFolderManager(): void {
  localFolderManagerInstance = null;
}
