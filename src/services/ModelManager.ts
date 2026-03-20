import * as FileSystem from 'expo-file-system/legacy';
import { getModelById } from '../constants/ModelRegistry';
import { ModelRepo } from '../repositories/model_repo';
import { resolveFallbackActiveModelId } from './model_manager_utils';

const MODELS_DIR = ((FileSystem as any).documentDirectory || '') + 'models/';

export const ModelManager = {
    ensureDir: async () => {
        const dirInfo = await FileSystem.getInfoAsync(MODELS_DIR);
        if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(MODELS_DIR);
        }
    },

    getModelPath: (modelId: string): string => {
        const modelConfig = getModelById(modelId);
        if (!modelConfig) {
            throw new Error(`Model ${modelId} not found in registry`);
        }
        return MODELS_DIR + modelConfig.filename;
    },

    isInstalled: async (modelId: string): Promise<boolean> => {
        try {
            const path = ModelManager.getModelPath(modelId);
            const fileInfo = await FileSystem.getInfoAsync(path);

            if (!fileInfo.exists) {
                return false;
            }

            // Validate file size is reasonable (at least 50% of expected size)
            const modelConfig = getModelById(modelId);
            const fileSize = fileInfo.exists && 'size' in fileInfo && typeof fileInfo.size === 'number'
                ? fileInfo.size
                : 0;

            if (modelConfig && fileSize > 0) {
                const minExpectedSize = modelConfig.sizeBytes * 0.5;
                return fileSize >= minExpectedSize;
            }

            return true;
        } catch (error) {
            console.error('Error checking if model is installed:', error);
            return false;
        }
    },

    downloadModel: async (
        modelId: string,
        onProgress?: (progress: number) => void,
        options: { activate?: boolean } = {}
    ): Promise<string> => {
        const modelConfig = getModelById(modelId);
        if (!modelConfig) {
            throw new Error(`Model ${modelId} not found in registry`);
        }

        await ModelManager.ensureDir();
        const path = ModelManager.getModelPath(modelId);

        const downloadResumable = FileSystem.createDownloadResumable(
            modelConfig.url,
            path,
            {},
            (downloadProgress) => {
                const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
                if (onProgress) {
                    onProgress(progress);
                }
            }
        );

        try {
            const result = await downloadResumable.downloadAsync();

            if (!result || !result.uri) {
                throw new Error('Download failed: no result URI');
            }

            // Verify file size
            const fileInfo = await FileSystem.getInfoAsync(result.uri);
            if (!fileInfo.exists || !('size' in fileInfo) || typeof fileInfo.size !== 'number') {
                throw new Error('Downloaded file not found or has no size');
            }

            // Check if file size is at least 50% of expected (some tolerance for compression)
            const minExpectedSize = modelConfig.sizeBytes * 0.5;
            if (fileInfo.size < minExpectedSize) {
                await FileSystem.deleteAsync(result.uri);
                throw new Error(`Downloaded file too small: ${fileInfo.size} bytes (expected ~${modelConfig.sizeBytes})`);
            }

            // Save installation metadata.
            await ModelRepo.installModel(modelId, result.uri, fileInfo.size);

            if (options.activate) {
                await ModelRepo.activateModel(modelId);
            }

            return result.uri;
        } catch (error) {
            console.error('Download error:', error);
            // Clean up partial download
            try {
                const fileInfo = await FileSystem.getInfoAsync(path);
                if (fileInfo.exists) {
                    await FileSystem.deleteAsync(path);
                }
            } catch (cleanupError) {
                console.error('Error cleaning up partial download:', cleanupError);
            }
            throw error;
        }
    },

    deleteModel: async (
        modelId: string
    ): Promise<{ deletedWasActive: boolean; fallbackActiveModelId: string | null }> => {
        try {
            const currentActiveModel = await ModelRepo.getActiveModel();
            const deletedWasActive = currentActiveModel?.model_id === modelId;

            const path = ModelManager.getModelPath(modelId);
            const fileInfo = await FileSystem.getInfoAsync(path);

            if (fileInfo.exists) {
                await FileSystem.deleteAsync(path);
            }

            // Remove from database
            await ModelRepo.deleteModel(modelId);

            let fallbackActiveModelId: string | null = null;
            if (deletedWasActive) {
                const remainingModels = await ModelRepo.getInstalledModels();
                fallbackActiveModelId = resolveFallbackActiveModelId(deletedWasActive, remainingModels);
                if (fallbackActiveModelId) {
                    await ModelRepo.activateModel(fallbackActiveModelId);
                } else {
                    await ModelRepo.clearActiveModel();
                }
            }

            return { deletedWasActive, fallbackActiveModelId };
        } catch (error) {
            console.error('Error deleting model:', error);
            throw error;
        }
    },

    getInstalledModels: async () => {
        return await ModelRepo.getInstalledModels();
    },

    getActiveModel: async () => {
        return await ModelRepo.getActiveModel();
    },

    setActiveModel: async (modelId: string) => {
        const installed = await ModelManager.isInstalled(modelId);
        if (!installed) {
            throw new Error(`Model ${modelId} is not installed`);
        }

        const path = ModelManager.getModelPath(modelId);
        const fileInfo = await FileSystem.getInfoAsync(path);
        const fileSize = fileInfo.exists && 'size' in fileInfo && typeof fileInfo.size === 'number'
            ? fileInfo.size
            : 0;

        await ModelRepo.installModel(modelId, path, fileSize);
        await ModelRepo.activateModel(modelId);
    },

    // Legacy compatibility
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
