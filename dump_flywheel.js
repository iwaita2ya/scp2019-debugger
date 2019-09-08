const targetPort = '/dev/ttyUSB0';
const SerialPort = require('serialport');
const {once} = require('events');
const fs = require("fs");
const { createReadStream } = require('fs');
const { createInterface } = require('readline');
const path = require('path');
const dateFormat = require('dateformat');
// const dumpFileName = '20190820_02_flywheel.dump';
const dumpFileName = '20190908_01_flywheel.dump';
const dumpFilePath = path.resolve(__dirname, 'dumps', dumpFileName);

/**
 * zeroPadding
 * @param string
 * @param padSize
 * @param padChar
 * @returns {*}
 */
const zeroPadding = (string, padSize=8, padChar='0') => {
    while (string.length < (padSize || 2)) {string = padChar + string;}
    return string;
};

/**
 * 設定読み込み
 */
process.env.NODE_CONFIG_DIR = path.join(__dirname, 'config');
const config = require('config');
const logFilePrefix = 'flywheel';

/**
 * ログファイル準備
 */
// 日付取得
const now = new Date();
const dateFormatted = dateFormat(now, "yyyymmdd");

// ログファイルパス＆ファイル名設定
let logFilePath = config.get('log.file_path');
if(!path.isAbsolute(logFilePath)) {
    logFilePath = path.resolve(__dirname, logFilePath);
}
const logFileName = logFilePrefix + '-' + dateFormatted + '.log';

// エラーレベル設定
const validErrorLevel = ["trace", "debug", "info", "warn", "error", "fatal"];
let errorLogLevel = config.get('log.error_level');
if((validErrorLevel.indexOf(errorLogLevel) === -1)) {
    // 指定外のエラーレベルが指定された場合は debug 扱い
    errorLogLevel = 'debug';
}

// log4js 設定
const log4js = require('log4js');
log4js.configure({
    appenders: {
        dump_flywheel: { type: 'file', filename: path.join(logFilePath, logFileName) }
    },
    categories: {
        default: { appenders: ['dump_flywheel'], level: errorLogLevel }
    }
});
const logger = log4js.getLogger('dump_flywheel');

/**
 * シリアル設定
 */
const port = new SerialPort(
    targetPort,
    {
        autoOpen: true,
        baudRate: 115200,
        dataBits: 8,
        lock: true,
        stopBits: 1,
        parity: 'none',
        rtscts: false,
        xany: false,
        xoff: false,
        xon: false
    });

// parser
const {ByteLength} = SerialPort.parsers;// バイト長で切る
const parser = port.pipe(new ByteLength({length:9}));    // バイト長で区切る場合

// data receiver
parser.on('data', (data) => {
    /**
     * uint8_t _currentStatus,
     * int16_t _gz_raw,
     * uint8_t _aDutyIndex,
     * uint8_t _bDutyIndex,
     * uint16_t _aRPM,
     * uint16_t _bRPM
     */
    let buf = Buffer.from(data);

    const currentStatus = buf.readUInt8(0);
    const gz_raw = buf.readInt16LE(1);
    const aDutyIndex = buf.readUInt8(3);
    const bDutyIndex = buf.readUInt8(4);
    const aRPM = buf.readUInt16LE(5);
    const bRPM = buf.readUInt16LE(7);

    console.log(currentStatus + "," + gz_raw + "," + aDutyIndex + "," + bDutyIndex + "," + aRPM + "," + bRPM);

    //TODO: ファイルに書き出す
});

port.on('error', err => console.error(err.message));


/**
 * Open Port
 * @param port
 * @returns {Promise}
 */
const openPort = (port) => new Promise(
    resolve => {
        port.on('open', () => {
            resolve();
        });
    }
);

/**
 * Send Command
 * @param port
 * @param commandBytes
 * @param waitMs
 * @returns {Promise}
 */
const sendCommand = (port, commandBytes, waitMs=3000) => new Promise (
    resolve => {
        port.write(Buffer.from(commandBytes), 'hex', () => {
            // 送信終わりを待つ
            port.drain(() => {
                setTimeout(() => {
                    resolve();
                }, waitMs);
            });
        });
    }
);

const readDumpFile = (filePath) => new Promise (
    resolve => {
        const fileStream = fs.createReadStream(dumpFilePath);
        const readLine = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let byteDataSet = {};

    }
);

//------------------------------------------------
// データ送信テスト
//------------------------------------------------
(async () => {

    // Open Port
    // logger.debug('Port Open.');
    // await openPort(port);
    //
    // // Send Dump Command
    // console.log('Send Dump Command');
    // await sendCommand(port, [0x40, 0x0d]);
    //
    // Close Port
    logger.debug('Close Port');
    if(port.isOpen) {
        port.close();
    } else {
        console.warn('Port is not opened.');
    }

    // Read Dump File
    logger.debug(`Dump File: ${dumpFilePath}`);
    try {
        const readline = createInterface({
            input: createReadStream(dumpFilePath),
            crlfDelay: Infinity
        });

        let byteDataSet = {};
        readline.on('line', (line) => {
            if(line.match(/^[0-9a-f]{4}\s([0-9a-f]{2}\s?){16}/gi)) {
                // console.log(line);
                const lineData = line.split(' ');
                const offset = Buffer.from(lineData.shift(), 'hex').readUInt16BE(0);
                //console.log(`offset:${offset}`);
                for (let i=0; i<16; i++) {
                    //console.log(lineData[i]);
                    byteDataSet[offset+i] = lineData[i];
                }
            } else {
                logger.trace(`SKIP: ${line}`)
            }
        });
        // await till the end of file read
        await once(readline, 'close');

        console.log('File processed.');

        /**
         * struct SystemParameters {
         *   uint8_t statusFlags;
         *   int16_t gyroBiasRawX;   // ジャイロの補正値(X軸)
         *   int16_t gyroBiasRawY;   // ジャイロの補正値(Y軸)
         *   int16_t gyroBiasRawZ;   // ジャイロの補正値(Z軸)
         *   uint8_t enableLogging;  // ロギング設定 (0x00:無効 0x01:有効)
         *   uint16_t logPointer;    // 最終ログ格納アドレス (0x0020-0x0800)
         *   time_t logStartTime;    // ロギング開始時刻(RTCから取得する）
         * };
         */

        //TODO: display result
        const currentStatus = Buffer.from(byteDataSet[0], 'hex').readUInt8(0).toString(2);
        const gyroBiasRawX = Buffer.from(byteDataSet[1] + byteDataSet[2], 'hex').readInt16LE(0);
        const gyroBiasRawY = Buffer.from(byteDataSet[3] + byteDataSet[4], 'hex').readInt16LE(0);
        const gyroBiasRawZ = Buffer.from(byteDataSet[5] + byteDataSet[6], 'hex').readInt16LE(0);
        const enableLogging = Buffer.from(byteDataSet[7], 'hex').readUInt8(0);
        const logPointer = Buffer.from(byteDataSet[8] + byteDataSet[9], 'hex').readUInt16LE(0);
        const logStartTime = Buffer.from(byteDataSet[10] + byteDataSet[11] + byteDataSet[12] + byteDataSet[13], 'hex').readUInt32LE(0);

        // Status Flag
        console.log('----- Config Value -----');
        console.log(`Status     : ${zeroPadding(currentStatus,8)}`);
        console.log(`gBiasRawX  : ${gyroBiasRawX}`);
        console.log(`gBiasRawX  : ${gyroBiasRawY}`);
        console.log(`gBiasRawX  : ${gyroBiasRawZ}`);
        console.log(`Enable Log : ` + (enableLogging === 1 ? 'Yes' : 'No'));
        console.log(`Log Pointer: 0x${zeroPadding(logPointer.toString(16), 4)}`);
        console.log(`logStart   : ${logStartTime}`);

        /**
         * uint8_t _currentStatus,
         * int16_t _gz_raw,
         * uint8_t _aDutyIndex,
         * uint8_t _bDutyIndex,
         * uint16_t _aRPM,
         * uint16_t _bRPM
         */

        console.log('----- Output Log -----');
        console.log('     ADDR,   STATUS,  gzRaw,aIdx,bIdx,  aRPM,  bRPM');

        //MEMO: 最終ログポインタから順番に表示させる版
        //
        // let currentIndex = logPointer;
        // const dataSize = 9; // bytes for each dataset
        //
        // while ((currentIndex - dataSize) > 24) {
        //     let dataStart = currentIndex - dataSize;
        //
        //     const status = Buffer.from(byteDataSet[dataStart], 'hex').readUInt8(0).toString(2);
        //     const gz_raw = Buffer.from(byteDataSet[dataStart + 1] + byteDataSet[dataStart + 2], 'hex').readInt16LE(0).toString();
        //     const aDutyIndex = Buffer.from(byteDataSet[dataStart + 3], 'hex').readUInt8(0).toString();
        //     const bDutyIndex = Buffer.from(byteDataSet[dataStart + 4], 'hex').readUInt8(0).toString();
        //     const aRPM = Buffer.from(byteDataSet[dataStart + 5] + byteDataSet[currentIndex - 3], 'hex').readUInt16LE(0).toString();
        //     const bRPM = Buffer.from(byteDataSet[dataStart + 6] + byteDataSet[currentIndex - 1], 'hex').readUInt16LE(0).toString();
        //
        //     console.log(`${zeroPadding(dataStart.toString(16), 4)}-${zeroPadding((dataStart+9).toString(16), 4)}, ${zeroPadding(status,8)}, ${zeroPadding(gz_raw, 5, ' ')}, ${zeroPadding(aDutyIndex, 3, ' ')}, ${zeroPadding(bDutyIndex, 3, ' ')}, ${zeroPadding(aRPM, 5, ' ')}, ${zeroPadding(bRPM, 5, ' ')}`); // status
        //
        //     currentIndex -= dataSize;
        // }

        //MEMO: 0x20 から順番に表示させる版
        let currentIndex = 32; // 0x20
        const dataSize = 9; // bytes for each dataset

        while (currentIndex < logPointer) {
            let dataStart = currentIndex;

            const status = Buffer.from(byteDataSet[dataStart], 'hex').readUInt8(0).toString(2);
            const gz_raw = Buffer.from(byteDataSet[dataStart + 1] + byteDataSet[dataStart + 2], 'hex').readInt16LE(0).toString();
            const aDutyIndex = Buffer.from(byteDataSet[dataStart + 3], 'hex').readUInt8(0).toString();
            const bDutyIndex = Buffer.from(byteDataSet[dataStart + 4], 'hex').readUInt8(0).toString();
            const aRPM = Buffer.from(byteDataSet[dataStart + 5] + byteDataSet[currentIndex + 6], 'hex').readUInt16LE(0).toString();
            const bRPM = Buffer.from(byteDataSet[dataStart + 7] + byteDataSet[currentIndex + 8], 'hex').readUInt16LE(0).toString();

            console.log(`${zeroPadding(dataStart.toString(16), 4)}-${zeroPadding((dataStart+9).toString(16), 4)}, ${zeroPadding(status,8)}, ${zeroPadding(gz_raw, 6, ' ')}, ${zeroPadding(aDutyIndex, 3, ' ')}, ${zeroPadding(bDutyIndex, 3, ' ')}, ${zeroPadding(aRPM, 5, ' ')}, ${zeroPadding(bRPM, 5, ' ')}`); // status

            currentIndex += dataSize;
        }

        // console.log(byteDataSet);

    } catch (err) {
        logger.error(err);
    }



    // const fileStream = fs.createReadStream(dumpFilePath);
    // const readLine = readline.createInterface({
    //     input: fileStream,
    //     crlfDelay: Infinity
    // });
    // // Note: we use the crlfDelay option to recognize all instances of CR LF
    // // ('\r\n') in input.txt as a single line break.
    // let byteDataSet = {};
    // for await (const line of readLine) {
    //     // Each line in input.txt will be successively available here as `line`.
    //     // if(line.match(/^[0-9,a-f]{4}\s([0-9,a-f]?\s){16}$/gi)) {
    //     if(line.match(/^[0-9a-f]{4}\s([0-9a-f]{2}\s?){16}/gi)) {
    //         const lineData = line.split(' ');
    //         const buf = Buffer.from(lineData.shift());
    //         const offset = buf.readInt16LE(0);
    //         for (let i=0; i<16; i++) {
    //             byteDataSet[offset+i] = lineData[i];
    //         }
    //     } else {
    //         logger.trace(`SKIP: ${line}`)
    //     }
    // }
    // console.log(byteDataSet.length);

})();

return 0;