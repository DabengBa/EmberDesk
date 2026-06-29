import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';

import mime from 'mime-types';
import yauzl from 'yauzl';

/**
 * Extracts a file with given extension from an ArrayBuffer containing a ZIP archive.
 * @param {ArrayBufferLike} archiveBuffer Buffer containing a ZIP archive
 * @param {string} fileExtension File extension to look for
 * @returns {Promise<Buffer|null>} Buffer containing the extracted file. Null if the file was not found.
 */
export async function extractFileFromZipBuffer(archiveBuffer, fileExtension) {
    return await new Promise((resolve) => {
        try {
            yauzl.fromBuffer(Buffer.from(archiveBuffer), { lazyEntries: true }, (err, zipfile) => {
                if (err) {
                    console.warn(`Error opening ZIP file: ${err.message}`);
                    return resolve(null);
                }

                zipfile.readEntry();

                zipfile.on('entry', (entry) => {
                    if (entry.fileName.endsWith(fileExtension) && !entry.fileName.startsWith('__MACOSX')) {
                        zipfile.openReadStream(entry, (streamErr, readStream) => {
                            if (streamErr) {
                                console.warn(`Error opening read stream: ${streamErr.message}`);
                                return zipfile.readEntry();
                            }

                            const chunks = [];
                            readStream.on('data', (chunk) => {
                                chunks.push(chunk);
                            });

                            readStream.on('end', () => {
                                resolve(Buffer.concat(chunks));
                                zipfile.readEntry();
                            });

                            readStream.on('error', (readError) => {
                                console.warn(`Error reading stream: ${readError.message}`);
                                zipfile.readEntry();
                            });
                        });
                    } else {
                        zipfile.readEntry();
                    }
                });

                zipfile.on('error', (zipError) => {
                    console.warn('ZIP processing error', zipError);
                    resolve(null);
                });

                zipfile.on('end', () => resolve(null));
            });
        } catch (error) {
            console.warn('Failed to process ZIP buffer', error);
            resolve(null);
        }
    });
}

/**
 * Normalizes a ZIP entry path for safe extraction.
 * @param {string} entryName The entry name from the ZIP archive
 * @returns {string|null} Normalized path or null if invalid
 */
export function normalizeZipEntryPath(entryName) {
    if (typeof entryName !== 'string') {
        return null;
    }

    let normalized = entryName.replace(/\\/g, '/').trim();

    if (!normalized) {
        return null;
    }

    normalized = normalized.replace(/^\.\/+/g, '');
    normalized = path.posix.normalize(normalized);

    if (!normalized || normalized === '.' || normalized.startsWith('..')) {
        return null;
    }

    if (normalized.startsWith('/')) {
        normalized = normalized.slice(1);
    }

    return normalized;
}

/**
 * Extracts multiple files from an ArrayBuffer containing a ZIP archive.
 * @param {ArrayBufferLike} archiveBuffer Buffer containing a ZIP archive
 * @param {string[]} fileNames Array of file paths to extract
 * @returns {Promise<Map<string, Buffer>>} Map of normalized paths to their extracted buffers
 */
export async function extractFilesFromZipBuffer(archiveBuffer, fileNames) {
    const targets = new Map();

    if (Array.isArray(fileNames)) {
        for (const fileName of fileNames) {
            const normalized = normalizeZipEntryPath(fileName);
            if (normalized && !targets.has(normalized)) {
                targets.set(normalized, true);
            }
        }
    }

    if (targets.size === 0) {
        return new Map();
    }

    return await new Promise((resolve) => {
        const results = new Map();

        try {
            yauzl.fromBuffer(Buffer.from(archiveBuffer), { lazyEntries: true }, (err, zipfile) => {
                if (err) {
                    console.warn(`Error opening ZIP file: ${err.message}`);
                    return resolve(results);
                }

                let finished = false;
                const finalize = () => {
                    if (finished) {
                        return;
                    }
                    finished = true;
                    resolve(results);
                };

                zipfile.readEntry();

                zipfile.on('entry', (entry) => {
                    const normalizedEntry = normalizeZipEntryPath(entry.fileName);
                    if (!normalizedEntry || !targets.has(normalizedEntry)) {
                        return zipfile.readEntry();
                    }

                    zipfile.openReadStream(entry, (streamErr, readStream) => {
                        if (streamErr) {
                            console.warn(`Error opening read stream: ${streamErr.message}`);
                            return zipfile.readEntry();
                        }

                        const chunks = [];
                        readStream.on('data', (chunk) => {
                            chunks.push(chunk);
                        });

                        readStream.on('end', () => {
                            results.set(normalizedEntry, Buffer.concat(chunks));
                            targets.delete(normalizedEntry);

                            if (targets.size === 0) {
                                finalize();
                            } else {
                                zipfile.readEntry();
                            }
                        });

                        readStream.on('error', (readError) => {
                            console.warn(`Error reading stream: ${readError.message}`);
                            zipfile.readEntry();
                        });
                    });
                });

                zipfile.on('error', (zipError) => {
                    console.warn('ZIP processing error', zipError);
                    finalize();
                });

                zipfile.on('close', finalize);
                zipfile.on('end', finalize);
            });
        } catch (error) {
            console.warn('Failed to process ZIP buffer', error);
            resolve(results);
        }
    });
}

/**
 * Extracts all images from a ZIP archive.
 * @param {string} zipFilePath Path to the ZIP archive
 * @returns {Promise<[string, Buffer][]>} Array of image buffers
 */
export async function getImageBuffers(zipFilePath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(zipFilePath)) {
            reject(new Error('File not found'));
            return;
        }

        const imageBuffers = [];

        yauzl.open(zipFilePath, { lazyEntries: true }, (err, zipfile) => {
            if (err) {
                reject(err);
            } else {
                zipfile.readEntry();
                zipfile.on('entry', (entry) => {
                    const mimeType = mime.lookup(entry.fileName);
                    if (mimeType && mimeType.startsWith('image/') && !entry.fileName.startsWith('__MACOSX')) {
                        zipfile.openReadStream(entry, (streamErr, readStream) => {
                            if (streamErr) {
                                reject(streamErr);
                            } else {
                                const chunks = [];
                                readStream.on('data', (chunk) => {
                                    chunks.push(chunk);
                                });

                                readStream.on('end', () => {
                                    imageBuffers.push([path.parse(entry.fileName).base, Buffer.concat(chunks)]);
                                    zipfile.readEntry();
                                });
                            }
                        });
                    } else {
                        zipfile.readEntry();
                    }
                });

                zipfile.on('end', () => {
                    resolve(imageBuffers);
                });

                zipfile.on('error', (zipError) => {
                    reject(zipError);
                });
            }
        });
    });
}
