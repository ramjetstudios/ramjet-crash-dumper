const ReadString = (ptr: number, dump: Buffer): [number, string] => {
  let read = 0;
  const len = dump.readUint32LE(ptr);
  ptr += 4;
  read += 4;

  let data = '';
  for (let i = 0; i < len; i++) {
    const code = dump.readUintLE(ptr, 1);
    if (code > 0) {
      data += String.fromCharCode(code);
    }
    ptr += 1;
    read += 1;
  }

  return [read, data];
};

interface IUnrealDump {
  dumpID: string;
  dumpFilename: string;
  fileLen: number;
  files: { [key: string]: string };
}

export default function ReadUnrealDump(dump: Buffer): IUnrealDump {
  const files: { [key: string]: string } = {};

  let ptr = 0;
  const first =
    String.fromCharCode(dump.readUintLE(ptr, 1)) +
    String.fromCharCode(dump.readUintLE(ptr + 1, 1)) +
    String.fromCharCode(dump.readUintLE(ptr + 2, 1));

  if (first !== 'CR1') {
    throw new Error('bad file');
  }

  ptr += 3;

  const [n1, id] = ReadString(ptr, dump);
  ptr += n1;

  const [n2, dumpFilename] = ReadString(ptr, dump);
  ptr += n2;

  const fileLen = dump.readUInt32LE(ptr);
  ptr += 4;

  const fileCount = dump.readUint32LE(ptr);
  ptr += 8;

  for (let i = 0; i < fileCount; i++) {
    const [fnLen, fn] = ReadString(ptr, dump);
    ptr += fnLen;

    const [dataLen, data] = ReadString(ptr, dump);
    ptr += dataLen;

    if (i < fileCount - 1) {
      const idk = dump.readUint32LE(ptr);
      ptr += 4;
    }

    files[fn] = data;
  }

  return { files, fileLen, dumpFilename, dumpID: id };
}
