import * as FileSystem from 'expo-file-system';

const MODELS_DIR = ((FileSystem as any).documentDirectory || '') + 'models/';

export const ModelManager = {
    ensureDir: async () => {
        const dirInfo = await FileSystem.getInfoAsync(MODELS_DIR);
        if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(MODELS_DIR);
        }
    },

    exists: async (filename: string) => {
        const fileInfo = await FileSystem.getInfoAsync(MODELS_DIR + filename);
        return fileInfo.exists;
    },

    getPath: (filename: string) => {
        return MODELS_DIR + filename;
    },

    download: async (url: string, filename: string, onProgress?: (percent: number) => void) => {
        await ModelManager.ensureDir();
        const downloadResumable = FileSystem.createDownloadResumable(
            url,
            MODELS_DIR + filename,
            {},
            (downloadProgress) => {
                const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
                if (onProgress) onProgress(progress);
            }
        );

        try {
            const uri = await downloadResumable.downloadAsync();
            return uri;
        } catch (e) {
            console.error(e);
            throw e;
        }
    }
};
