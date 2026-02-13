import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import yauzl from 'yauzl';
import yazl from 'yazl';

const addDirectoryToZip = ({
  absoluteDirectoryPath,
  archivePath,
  zipFile,
}: {
  absoluteDirectoryPath: string;
  archivePath: string;
  zipFile: yazl.ZipFile;
}): void => {
  const entries = fs.readdirSync(absoluteDirectoryPath, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const entryPath = path.join(absoluteDirectoryPath, entry.name);
    const entryArchivePath = path.join(archivePath, entry.name);

    if (entry.isDirectory()) {
      addDirectoryToZip({
        absoluteDirectoryPath: entryPath,
        archivePath: entryArchivePath,
        zipFile,
      });
      continue;
    }

    if (entry.isFile()) {
      zipFile.addFile(entryPath, entryArchivePath);
    }
  }
};

export const zipDirectory = async ({
  destinationZipPath,
  sourceDirectoryPath,
}: {
  destinationZipPath: string;
  sourceDirectoryPath: string;
}): Promise<void> => {
  const zipFile = new yazl.ZipFile();

  addDirectoryToZip({
    absoluteDirectoryPath: sourceDirectoryPath,
    archivePath: '',
    zipFile,
  });

  await fsPromises.mkdir(path.dirname(destinationZipPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    zipFile.outputStream
      .pipe(fs.createWriteStream(destinationZipPath))
      .on('close', resolve)
      .on('error', reject);

    zipFile.end();
  });
};

export const unzipArchive = async ({
  destinationDirectoryPath,
  sourceZipPath,
}: {
  destinationDirectoryPath: string;
  sourceZipPath: string;
}): Promise<void> => {
  await fsPromises.mkdir(destinationDirectoryPath, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    yauzl.open(sourceZipPath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError) {
        reject(openError);
        return;
      }

      if (!zipFile) {
        reject(new Error(`Unable to open zip: ${sourceZipPath}`));
        return;
      }

      zipFile.readEntry();

      zipFile.on('entry', (entry) => {
        const outputPath = path.resolve(
          destinationDirectoryPath,
          entry.fileName
        );

        if (entry.fileName.endsWith('/')) {
          fsPromises
            .mkdir(outputPath, { recursive: true })
            .then(() => {
              zipFile.readEntry();
            })
            .catch(reject);
          return;
        }

        zipFile.openReadStream(entry, (streamError, readStream) => {
          if (streamError) {
            reject(streamError);
            return;
          }

          if (!readStream) {
            reject(new Error(`Unable to read zip entry: ${entry.fileName}`));
            return;
          }

          fsPromises
            .mkdir(path.dirname(outputPath), { recursive: true })
            .then(() => {
              readStream
                .pipe(fs.createWriteStream(outputPath))
                .on('error', reject)
                .on('finish', () => {
                  zipFile.readEntry();
                });
            })
            .catch(reject);
        });
      });

      zipFile.on('error', reject);
      zipFile.on('end', () => {
        const rootFiles = fs.readdirSync(destinationDirectoryPath);
        for (const fileName of rootFiles) {
          if (fileName.startsWith('DONE')) {
            fs.rmSync(path.join(destinationDirectoryPath, fileName), {
              force: true,
              recursive: true,
            });
          }
        }
      });
      zipFile.on('close', resolve);
    });
  });
};
